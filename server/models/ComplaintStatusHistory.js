const mongoose = require('mongoose');
const schema = new mongoose.Schema({ complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true }, previousStatus: String, newStatus: { type: String, required: true }, source: { type: String, required: true } }, { timestamps: true });
schema.index({ complaintId: 1, createdAt: 1 });
module.exports = mongoose.model('ComplaintStatusHistory', schema);
