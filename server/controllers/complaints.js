const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const Category = require('../models/Category');
const History = require('../models/ComplaintStatusHistory');
const storage = require('../services/storage');
const FileOperation = require('../models/FileOperation');
const recovery = require('../services/fileRecovery');
const { deleteComplaint } = require('../services/complaintDeletion');
const { fail, text } = require('../utils/http');
const owned = async req => { if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Complaint not found.'); const complaint = await Complaint.findOne({ _id: req.params.id, citizenId: req.user._id }).populate('categoryId', 'name slug'); if (!complaint) throw fail(404, 'Complaint not found.'); return complaint; };
const project = c => { const o = c.toObject(); o.photos = o.photos.map(p => ({ id: p._id, url: `/api/v1/complaints/${o._id}/photos/${p._id}` })); return o; };
exports.categories = async (req, res) => res.json({ data: await Category.find({ isActive: true }).sort('sortOrder').select('name slug') });
exports.create = async (req, res) => {
  const b = req.body; const title = text(b.title, 'Title', 120, 5), description = text(b.description, 'Description', 3000, 10);
  const city = text(b.city, 'City', 100), locality = text(b.locality, 'Locality', 100), address = text(b.address, 'Address', 300);
  if (!mongoose.isValidObjectId(b.categoryId) || !await Category.exists({ _id: b.categoryId, isActive: true })) throw fail(400, 'Select a valid category.');
  const location = { city, locality, address }; if (b.latitude || b.longitude) { if (!b.latitude || !b.longitude || !Number.isFinite(Number(b.latitude)) || !Number.isFinite(Number(b.longitude)) || Math.abs(Number(b.latitude)) > 90 || Math.abs(Number(b.longitude)) > 180) throw fail(400, 'Enter valid latitude and longitude together.'); location.latitude = Number(b.latitude); location.longitude = Number(b.longitude); }
  const photos = [], operations = []; let complaint;
  try {
    for (const file of req.files || []) {
      const prepared = await storage.prepare(file);
      const operation = await FileOperation.create({ key: prepared.key, kind: 'pending_upload' });
      operations.push(operation);
      recovery.activeUploads.add(String(operation._id));
      await storage.upload(prepared);
      photos.push({ key: prepared.key, contentType: prepared.contentType, size: prepared.size });
    }
  } catch (err) {
    for (const operation of operations) { try { if (err.storageCollision && operation === operations[operations.length - 1]) await FileOperation.deleteOne({ _id: operation._id }); else await recovery.cleanup(operation); } catch { console.error('Upload cleanup queued for retry:', String(operation._id)); } finally { recovery.activeUploads.delete(String(operation._id)); } }
    throw err;
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      [complaint] = await Complaint.create([{ citizenId: req.user._id, title, description, categoryId: b.categoryId, location, photos }], { session });
      await History.create([{ complaintId: complaint._id, previousStatus: null, newStatus: 'submitted', source: 'citizen_submission' }], { session });
      for (const operation of operations) await FileOperation.deleteOne({ _id: operation._id }, { session });
    });
  } finally { for (const operation of operations) recovery.activeUploads.delete(String(operation._id)); await session.endSession(); }
  await complaint.populate('categoryId', 'name slug'); res.status(201).json({ data: project(complaint) });
};
exports.list = async (req, res) => {
  const query = { citizenId: req.user._id }; if (req.query.status) query.currentStatus = String(req.query.status); if (req.query.category) { if (!mongoose.isValidObjectId(req.query.category)) throw fail(400, 'Invalid category.'); query.categoryId = req.query.category; }
  if (req.query.search) { const s = String(req.query.search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); query.$or = [{ title: { $regex: s, $options: 'i' } }, { description: { $regex: s, $options: 'i' } }, { 'location.locality': { $regex: s, $options: 'i' } }]; }
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1)), limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10)); const sort = req.query.sort === 'oldest' ? 1 : -1;
  const [items, total] = await Promise.all([Complaint.find(query).populate('categoryId', 'name slug').sort({ createdAt: sort }).skip((page - 1) * limit).limit(limit), Complaint.countDocuments(query)]);
  res.json({ data: items.map(project), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};
exports.stats = async (req, res) => { const rows = await Complaint.aggregate([{ $match: { citizenId: req.user._id } }, { $group: { _id: '$currentStatus', count: { $sum: 1 } } }]); const counts = Object.fromEntries(rows.map(r => [r._id, r.count])); res.json({ data: { total: rows.reduce((a, b) => a + b.count, 0), awaiting: (counts.submitted || 0) + (counts.under_review || 0), inProgress: counts.in_progress || 0, resolved: counts.resolved || 0 } }); };
exports.detail = async (req, res) => res.json({ data: project(await owned(req)) });
exports.history = async (req, res) => { const c = await owned(req); res.json({ data: await History.find({ complaintId: c._id }).sort('createdAt').select('previousStatus newStatus source createdAt') }); };
exports.photo = async (req, res) => { const c = await owned(req); const p = c.photos.id(req.params.photoId); if (!p) throw fail(404, 'Photo not found.'); res.set('Content-Type', p.contentType); res.set('X-Content-Type-Options', 'nosniff'); res.sendFile(storage.get(p.key)); };
exports.remove = async (req, res) => {
  const operations = await deleteComplaint(req.params.id, req.user._id);
  for (const operation of operations) { try { await recovery.cleanup(operation); } catch { console.error('Photo deletion queued for retry:', String(operation._id)); } }
  res.json({ message: 'Complaint deleted.' });
};
