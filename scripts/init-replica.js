// Run once after starting the project-local mongod with --replSet civictrack-rs.
const { MongoClient } = require('mongoose').mongo;
async function main() {
  const client = new MongoClient('mongodb://127.0.0.1:27017/?directConnection=true', { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const admin = client.db('admin');
    const hello = await admin.command({ hello: 1 });
    if (hello.setName) {
      if (hello.setName !== 'civictrack-rs' || hello.hosts?.some(host => host !== '127.0.0.1:27017')) throw new Error('This is not the expected loopback-only replica set.');
      console.log('Replica set is already configured.');
    } else {
      await admin.command({ replSetInitiate: { _id: 'civictrack-rs', members: [{ _id: 0, host: '127.0.0.1:27017' }] } });
      console.log('Replica set initialized; allow a few seconds for primary election.');
    }
  } finally { await client.close(); }
}
main().catch(error => { console.error('Replica setup failed:', error.message); process.exitCode = 1; });
