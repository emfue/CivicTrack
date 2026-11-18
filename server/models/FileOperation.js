const mongoose = require('mongoose');

// A durable work item links filesystem cleanup to committed database changes.
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['pending_upload', 'delete'], required: true }
}, { timestamps: true });
schema.index({ kind: 1, createdAt: 1 });
module.exports = mongoose.model('FileOperation', schema);
