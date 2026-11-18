const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { fail, asyncRoute } = require('../utils/http');
exports.cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60 * 1000 });
exports.issue = (res, user) => res.cookie(process.env.COOKIE_NAME || 'civictrack_session', jwt.sign({ sub: String(user._id), version: user.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1d' }), exports.cookieOptions());
exports.requireAuth = asyncRoute(async (req, res, next) => {
  let payload; try { payload = jwt.verify(req.cookies[process.env.COOKIE_NAME || 'civictrack_session'], process.env.JWT_SECRET); } catch { throw fail(401, 'Please sign in to continue.'); }
  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || user.accountStatus !== 'active' || user.tokenVersion !== payload.version) throw fail(401, 'Session expired. Please sign in again.');
  req.user = user; next();
});
