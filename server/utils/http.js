exports.fail = (status, message) => Object.assign(new Error(message), { status });
exports.asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
exports.text = (value, label, max, min = 1) => { if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw exports.fail(400, `${label} must be ${min}–${max} characters.`); return value.trim(); };
exports.password = value => { if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 72) throw exports.fail(400, 'Password must be at least 8 characters and at most 72 bytes.'); return value; };
exports.email = value => { const v = exports.text(value, 'Email', 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw exports.fail(400, 'Enter a valid email address.'); return v; };
exports.phone = value => { if (!value) return ''; const v = exports.text(value, 'Phone', 30); if (!/^[+\d\s()\-]+$/.test(v)) throw exports.fail(400, 'Enter a valid phone number.'); return v; };
