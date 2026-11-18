const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, default: '', maxlength: 30 },
  accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active' },
  tokenVersion: { type: Number, default: 0, select: false }
}, { timestamps: true });
module.exports = mongoose.model('User', schema);
