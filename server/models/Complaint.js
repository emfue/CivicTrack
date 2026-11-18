const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  citizenId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  location: { city: { type: String, required: true, maxlength: 100 }, locality: { type: String, required: true, maxlength: 100 }, address: { type: String, required: true, maxlength: 300 }, latitude: Number, longitude: Number },
  photos: [{ key: { type: String, required: true }, contentType: { type: String, required: true }, size: Number }],
  currentStatus: { type: String, enum: ['submitted', 'under_review', 'in_progress', 'resolved', 'rejected'], default: 'submitted' }
}, { timestamps: true });
schema.index({ citizenId: 1, createdAt: -1 });
module.exports = mongoose.model('Complaint', schema);
