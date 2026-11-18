const FileOperation = require('../models/FileOperation');
const storage = require('./storage');
const Complaint = require('../models/Complaint');
const activeUploads = new Set();

// Never scan or remove unrelated user files. Only keys recorded by this app are eligible.
async function cleanup(operation) {
  // Never remove an image still referenced by a committed complaint.
  if (await Complaint.exists({ 'photos.key': operation.key })) { await FileOperation.deleteOne({ _id: operation._id }); return; }
  await storage.delete(operation.key);
  await FileOperation.deleteOne({ _id: operation._id });
}

async function recover() {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const operations = await FileOperation.find({ $or: [{ kind: 'delete' }, { kind: 'pending_upload', createdAt: { $lt: cutoff } }] }).limit(100);
  for (const operation of operations) {
    if (activeUploads.has(String(operation._id))) continue;
    try { await cleanup(operation); } catch { console.error('File cleanup failed; it will be retried:', String(operation._id)); }
  }
}

module.exports = { cleanup, recover, activeUploads };
