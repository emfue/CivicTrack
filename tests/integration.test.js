const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtemp, rm, writeFile, access, readdir } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

test('citizen workflows and security boundaries', async () => {
  const name = 'civictrack_test_' + crypto.randomBytes(8).toString('hex');
  const uri = 'mongodb://127.0.0.1:27017/' + name + '?replicaSet=civictrack-rs';
  const uploads = await mkdtemp(path.join(os.tmpdir(), 'civictrack-test-'));
  const port = 32000 + Math.floor(Math.random() * 10000);
  const env = { ...process.env, NODE_ENV: 'development', MONGODB_URI: uri, JWT_SECRET: crypto.randomBytes(32).toString('hex'), PORT: String(port), CLIENT_ORIGIN: `http://localhost:${port}`, UPLOAD_DIR: uploads };
  const child = spawn(process.execPath, ['server/server.js'], { cwd: path.resolve(__dirname, '..'), env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/api/v1`;
  const request = async (route, { cookie, body, headers = {}, ...opts } = {}) => { if (cookie) headers.cookie = cookie; if (body && !(body instanceof FormData)) { headers['content-type'] = 'application/json'; body = JSON.stringify(body); } const response = await fetch(base + route, { ...opts, headers, body }); const data = await response.json().catch(() => ({})); return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0], setCookie: response.headers.get('set-cookie'), headers: response.headers }; };
  try {
    let ready = false; for (let i=0;i<100;i++) { try { if ((await request('/categories')).status === 200) { ready=true; break; } } catch {} await new Promise(r=>setTimeout(r,100)); } assert.ok(ready, 'server started');
    const categories = (await request('/categories')).data.data; assert.equal(categories.length, 7);
    const a = { name: 'Test Citizen', email: 'a@example.test', password: 'Password123!', phone: '+91 1234567890' };
    const b = { ...a, name: 'Second Citizen', email: 'b@example.test' };
    const reg = await request('/auth/register', { method:'POST', body:a }); assert.equal(reg.status,201); let cookie = reg.cookie;
    assert.match(reg.setCookie, /HttpOnly/i); assert.match(reg.setCookie, /SameSite=Lax/i);
    assert.equal(reg.headers.get('x-content-type-options'),'nosniff');
    assert.equal((await request('/auth/me',{method:'PATCH',cookie,headers:{origin:'https://attacker.example'},body:{name:'Attacker'}})).status,403);
    assert.equal((await request('/auth/login',{method:'POST'})).status,400);
    assert.equal((await request('/auth/register', { method:'POST',body:a })).status,409);
    assert.equal((await request('/auth/me')).status,401);
    assert.equal((await request('/auth/me',{cookie})).data.data.email,a.email);
    assert.equal((await request('/auth/login',{method:'POST',body:{email:a.email,password:'WrongPassword'}})).status,401);
    const other = await request('/auth/register',{method:'POST',body:b}); assert.equal(other.status,201);
    assert.equal((await request('/auth/me',{method:'PATCH',cookie,body:{name:'Updated Citizen',phone:'12345'}})).data.data.name,'Updated Citizen');
    const makeForm = () => { const f = new FormData(); for (const [k,v] of Object.entries({ title:'Pothole on main road', description:'A large pothole near the junction.', categoryId:categories[0]._id, city:'Test City', locality:'Central', address:'Main Road' })) f.append(k,v); return f; };
    const invalid = makeForm(); invalid.append('photos',new Blob(['not an image'],{type:'image/png'}),'bad.png'); assert.equal((await request('/complaints',{method:'POST',cookie,body:invalid})).status,415);
    const huge = makeForm(); huge.append('photos',new Blob([Buffer.alloc(5242881)],{type:'image/png'}),'huge.png'); assert.equal((await request('/complaints',{method:'POST',cookie,body:huge})).status,413);
    const invalidFields = makeForm(); invalidFields.set('title','x'); assert.equal((await request('/complaints',{method:'POST',cookie,body:invalidFields})).status,400);
    const truncated = makeForm(); truncated.append('photos',new Blob([Buffer.from('89504e470d0a1a0a00000000','hex')],{type:'image/png'}),'bad.png'); assert.equal((await request('/complaints',{method:'POST',cookie,body:truncated})).status,415);
    const png = await require('sharp')({ create:{ width:2,height:2,channels:3,background:'#2266aa' } }).png().toBuffer();
    const partial = makeForm(); partial.append('photos',new Blob([png],{type:'image/png'}),'good.png'); partial.append('photos',new Blob(['bad'],{type:'image/png'}),'bad.png');
    assert.equal((await request('/complaints',{method:'POST',cookie,body:partial})).status,415); assert.deepEqual(await readdir(uploads),[]);
    const form = makeForm(); form.append('photos',new Blob([png],{type:'image/png'}),'photo.png'); const created = await request('/complaints',{method:'POST',cookie,body:form}); assert.equal(created.status,201); const id=created.data.data._id, photo=created.data.data.photos[0].url;
    assert.equal((await request('/complaints/'+id,{cookie:other.cookie})).status,404);
    assert.equal((await request('/complaints/not-a-valid-id',{cookie})).status,404);
    assert.equal((await request('/complaints/'+id+'/status-history',{cookie:other.cookie})).status,404);
    assert.equal((await fetch(`http://127.0.0.1:${port}${photo}`,{headers:{cookie:other.cookie}})).status,404);
    assert.equal((await fetch(`http://127.0.0.1:${port}${photo}`,{headers:{cookie}})).status,200);
    assert.equal((await request('/complaints?search=pothole&category='+categories[0]._id+'&status=submitted',{cookie})).data.data.length,1);
    assert.equal((await request('/complaints?search=nomatch',{cookie})).data.data.length,0);
    assert.equal((await request('/complaints/stats',{cookie})).data.data.total,1);
    assert.equal((await request('/complaints/'+id+'/status-history',{cookie})).data.data[0].newStatus,'submitted');
    assert.equal((await request('/complaints/'+id,{method:'PATCH',cookie,body:{currentStatus:'resolved'}})).status,404);
    await mongoose.connect(uri);
    const { changeStatus } = require('../server/services/status');
    await assert.rejects(changeStatus(id, 'under_review', { afterUpdate: () => { throw new Error('Injected transaction failure'); } }), /Injected transaction failure/);
    const Complaint = require('../server/models/Complaint');
    const History = require('../server/models/ComplaintStatusHistory');
    assert.equal((await Complaint.findById(id)).currentStatus, 'submitted');
    assert.equal(await History.countDocuments({ complaintId:id }), 1);
    await mongoose.disconnect();
    const status = spawnSync(process.execPath,['server/status.js',id,'under_review'],{cwd:path.resolve(__dirname,'..'),env,encoding:'utf8'}); assert.equal(status.status,0,status.stderr);
    assert.equal((await request('/complaints/'+id+'/status-history',{cookie})).data.data.length,2);
    assert.equal((await request('/complaints/'+id,{method:'DELETE',cookie})).status,409);
    const deleteForm = makeForm(); deleteForm.append('photos', new Blob([png], {type:'image/png'}),'delete.png');
    const deletable = await request('/complaints',{method:'POST',cookie,body:deleteForm}); assert.equal(deletable.status,201);
    await mongoose.connect(uri); const deleteRecord = await Complaint.findById(deletable.data.data._id); const deletedPath = path.join(uploads,deleteRecord.photos[0].key); await access(deletedPath);
    const { deleteComplaint } = require('../server/services/complaintDeletion');
    await assert.rejects(deleteComplaint(deleteRecord._id,deleteRecord.citizenId,{afterDelete:()=>{throw new Error('Injected delete failure');}}), /Injected delete failure/);
    assert.ok(await Complaint.exists({_id:deleteRecord._id})); assert.equal(await History.countDocuments({complaintId:deleteRecord._id}),1); await access(deletedPath); await mongoose.disconnect();
    assert.equal((await request('/complaints/'+deletable.data.data._id,{method:'DELETE',cookie})).status,200); assert.equal((await request('/complaints/'+deletable.data.data._id,{cookie})).status,404); await assert.rejects(access(deletedPath), { code:'ENOENT' });
    await mongoose.connect(uri);
    process.env.UPLOAD_DIR = uploads;
    const FileOperation = require('../server/models/FileOperation');
    const recovery = require('../server/services/fileRecovery');
    const oldKey = 'a'.repeat(32)+'.png', deleteKey = 'b'.repeat(32)+'.png', newKey = 'c'.repeat(32)+'.png';
    for (const key of [oldKey,deleteKey,newKey]) await writeFile(path.join(uploads,key),'temporary');
    await FileOperation.create({key:oldKey,kind:'pending_upload',createdAt:new Date(Date.now()-7200000)});
    await FileOperation.create({key:deleteKey,kind:'delete'}); await FileOperation.create({key:newKey,kind:'pending_upload'});
    const storage = require('../server/services/storage'); const actualDelete = storage.delete;
    storage.delete = async key => { if (key === deleteKey) throw new Error('Injected filesystem failure'); return actualDelete(key); };
    try { await recovery.recover(); assert.ok(await FileOperation.exists({key:deleteKey})); await access(path.join(uploads,deleteKey)); } finally { storage.delete = actualDelete; }
    await recovery.recover(); await assert.rejects(access(path.join(uploads,oldKey)),{code:'ENOENT'}); await assert.rejects(access(path.join(uploads,deleteKey)),{code:'ENOENT'}); await access(path.join(uploads,newKey));
    const referenced = await Complaint.findById(id); const referencedKey = referenced.photos[0].key;
    await FileOperation.create({key:referencedKey,kind:'delete'}); await recovery.recover(); await access(path.join(uploads,referencedKey)); assert.equal(await FileOperation.countDocuments({key:referencedKey}),0);
    await mongoose.disconnect();
    const badTransition = spawnSync(process.execPath,['server/status.js',id,'resolved'],{cwd:path.resolve(__dirname,'..'),env,encoding:'utf8'}); assert.notEqual(badTransition.status,0);
    assert.equal((await request('/auth/password',{method:'POST',cookie,body:{currentPassword:'WrongPassword',newPassword:'NewPassword123!'}})).status,400);
    const changed = await request('/auth/password',{method:'POST',cookie,body:{currentPassword:a.password,newPassword:'NewPassword123!'}}); assert.equal(changed.status,200); const oldCookie=cookie; cookie=changed.cookie;
    assert.equal((await request('/auth/me',{cookie:oldCookie})).status,401);
    assert.equal((await request('/auth/logout',{method:'POST',cookie})).status,200); assert.equal((await request('/auth/me',{cookie})).status,401);
    assert.equal((await request('/auth/login',{method:'POST',body:{email:a.email,password:'NewPassword123!'}})).status,200);
    const browserPath = process.env.CIVICTRACK_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const browser = await require('playwright-core').chromium.launch({ executablePath: browserPath, headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://localhost:${port}/pages/register.html`);
      await page.locator('[name=name]').fill('Browser Citizen'); await page.locator('[name=email]').fill('browser@example.test'); await page.locator('[name=password]').fill('BrowserPass123!'); await page.locator('[name=confirm]').fill('BrowserPass123!'); await page.getByRole('button',{name:'Create account'}).click();
      await page.waitForURL('**/pages/dashboard.html'); await page.getByText('Total reports').waitFor();
      await page.getByRole('link',{name:'+ Report an issue'}).first().click(); await page.waitForURL('**/pages/report.html');
      await page.locator('[name=title]').fill('Broken streetlight on Main Road'); await page.locator('[name=description]').fill('The light is not working near the junction.'); await page.locator('[name=categoryId]').selectOption({ label:'Streetlights' }); await page.locator('[name=city]').fill('Test City'); await page.locator('[name=locality]').fill('Central'); await page.locator('[name=address]').fill('Main Road');
      await page.getByRole('button',{name:'Submit report'}).click(); await page.waitForURL('**/pages/detail.html?id=*'); await page.getByText('Broken streetlight on Main Road').waitFor(); await page.getByText('Status history').waitFor();
      const detailUrl = page.url();
      for (const width of [390, 768, 1280]) {
        await page.setViewportSize({width,height:844});
        for (const target of ['/', '/pages/dashboard.html', '/pages/report.html', '/pages/complaints.html', detailUrl, '/pages/profile.html', '/pages/404.html']) {
          await page.goto(target.startsWith('http') ? target : `http://localhost:${port}${target}`);
          await page.locator('main h1').waitFor();
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), `${target} overflows at ${width}px`);
          assert.equal(await page.getByRole('link',{name:'Skip to main content'}).count(),1);
          if (process.env.CIVICTRACK_REVIEW_DIR && width === 1280) { const filename = target === '/' ? 'home' : target.startsWith('http') ? 'detail' : path.basename(target, '.html'); await page.screenshot({path:path.join(process.env.CIVICTRACK_REVIEW_DIR,filename+'.png')}); }
        }
      }
      await page.goto(`http://localhost:${port}/pages/complaints.html`); await page.getByRole('link',{name:'Broken streetlight on Main Road'}).waitFor();
      await page.locator('[name=search]').fill('no matching issue'); await page.getByRole('button',{name:'Apply filters'}).click(); await page.getByText('No reports to show').waitFor();
      await page.goto(`http://localhost:${port}/pages/profile.html`); await page.getByRole('button',{name:'Sign out'}).click(); await page.waitForURL(`http://localhost:${port}/`);
      for (const width of [390,768,1280]) { await page.setViewportSize({width,height:844}); for (const target of ['/pages/login.html','/pages/register.html']) { await page.goto(`http://localhost:${port}${target}`); await page.locator('main h1').waitFor(); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), `${target} overflows at ${width}px`); if (process.env.CIVICTRACK_REVIEW_DIR && width === 1280) await page.screenshot({path:path.join(process.env.CIVICTRACK_REVIEW_DIR,path.basename(target,'.html')+'.png')}); } }
      await page.goto(`http://localhost:${port}/pages/login.html`); await page.locator('[name=email]').fill('browser@example.test'); await page.locator('[name=password]').fill('BrowserPass123!'); await page.getByRole('button',{name:'Sign in'}).click(); await page.waitForURL('**/pages/dashboard.html');
    } finally { await browser.close(); }
  } finally {
    child.kill(); await mongoose.connect(uri); if (!/^civictrack_test_[a-f0-9]{16}$/.test(name)) throw new Error('Refusing to delete an unexpected database.'); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await rm(uploads,{recursive:true,force:true});
  }
});
