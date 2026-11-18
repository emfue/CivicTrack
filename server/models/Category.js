const mongoose = require('mongoose');
const schema = new mongoose.Schema({ name: { type: String, required: true }, slug: { type: String, required: true, unique: true }, isActive: { type: Boolean, default: true }, sortOrder: Number }, { timestamps: true });
module.exports = mongoose.model('Category', schema);
