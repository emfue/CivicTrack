const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const History = require('../models/ComplaintStatusHistory');
const allowed = { submitted: ['under_review', 'rejected'], under_review: ['in_progress', 'rejected'], in_progress: ['resolved', 'rejected'], resolved: [], rejected: [] };

async function changeStatus(id, next, options = {}) {
  if (!mongoose.isValidObjectId(id) || !Object.hasOwn(allowed, next)) throw new Error('Invalid complaint ID or status.');
  const session = await mongoose.startSession(); let previous;
  try {
    await session.withTransaction(async () => {
      const complaint = await Complaint.findById(id).session(session);
      if (!complaint || !allowed[complaint.currentStatus].includes(next)) throw new Error('Complaint not found or transition is not permitted.');
      previous = complaint.currentStatus;
      await Complaint.updateOne({ _id: id, currentStatus: previous }, { $set: { currentStatus: next } }, { session });
      if (options.afterUpdate) await options.afterUpdate();
      await History.create([{ complaintId: id, previousStatus: previous, newStatus: next, source: 'development_utility' }], { session });
    });
    return previous;
  } finally { await session.endSession(); }
}
module.exports = { changeStatus };
