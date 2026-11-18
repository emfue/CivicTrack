const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const History = require('../models/ComplaintStatusHistory');
const FileOperation = require('../models/FileOperation');
const { fail } = require('../utils/http');

async function deleteComplaint(id, citizenId, options = {}) {
  if (!mongoose.isValidObjectId(id)) throw fail(404, 'Complaint not found.');
  const session = await mongoose.startSession(); let operations = [];
  try {
    await session.withTransaction(async () => {
      operations = [];
      const complaint = await Complaint.findOne({ _id: id, citizenId }).session(session);
      if (!complaint) throw fail(404, 'Complaint not found.');
      if (complaint.currentStatus !== 'submitted') throw fail(409, 'Only submitted complaints can be deleted.');
      await Complaint.deleteOne({ _id: complaint._id }, { session });
      if (options.afterDelete) await options.afterDelete();
      await History.deleteMany({ complaintId: complaint._id }, { session });
      for (const photo of complaint.photos) {
        const [operation] = await FileOperation.create([{ key: photo.key, kind: 'delete' }], { session });
        operations.push(operation);
      }
    });
    return operations;
  } finally { await session.endSession(); }
}
module.exports = { deleteComplaint };
