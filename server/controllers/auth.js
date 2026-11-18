const bcrypt = require('bcrypt');
const User = require('../models/User');
const { fail, text, email, phone, password } = require('../utils/http');
const { issue, cookieOptions } = require('../middleware/auth');
const safe = user => ({ id: user.id, name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt });
exports.register = async (req, res) => {
  const name = text(req.body.name, 'Name', 100, 2), mail = email(req.body.email), pass = password(req.body.password), tel = phone(req.body.phone);
  try { const user = await User.create({ name, email: mail, phone: tel, passwordHash: await bcrypt.hash(pass, 12) }); issue(res, user); res.status(201).json({ data: safe(user) }); }
  catch (err) { if (err.code === 11000) throw fail(409, 'An account with that email already exists.'); throw err; }
};
exports.login = async (req, res) => {
  const mail = email(req.body.email), pass = password(req.body.password);
  const user = await User.findOne({ email: mail }).select('+passwordHash +tokenVersion');
  if (!user || user.accountStatus !== 'active' || !await bcrypt.compare(pass, user.passwordHash)) throw fail(401, 'Invalid email or password.');
  issue(res, user); res.json({ data: safe(user) });
};
exports.logout = async (req, res) => { await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } }); res.clearCookie(process.env.COOKIE_NAME || 'civictrack_session', { ...cookieOptions(), maxAge: undefined }); res.json({ message: 'Signed out.' }); };
exports.me = async (req, res) => res.json({ data: safe(req.user) });
exports.update = async (req, res) => { req.user.name = text(req.body.name, 'Name', 100, 2); req.user.phone = phone(req.body.phone); await req.user.save(); res.json({ data: safe(req.user) }); };
exports.changePassword = async (req, res) => { const old = password(req.body.currentPassword), next = password(req.body.newPassword); const user = await User.findById(req.user._id).select('+passwordHash +tokenVersion'); if (!await bcrypt.compare(old, user.passwordHash)) throw fail(400, 'Current password is incorrect.'); user.passwordHash = await bcrypt.hash(next, 12); user.tokenVersion++; await user.save(); issue(res, user); res.json({ message: 'Password updated.' }); };
