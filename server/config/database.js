const mongoose = require('mongoose');
const Category = require('../models/Category');
const User = require('../models/User');
const FileOperation = require('../models/FileOperation');
const categories = [['Roads and potholes','roads'], ['Garbage and sanitation','garbage'], ['Streetlights','streetlights'], ['Water supply and leakage','water'], ['Drainage and sewage','drainage'], ['Public infrastructure','infrastructure'], ['Other civic issues','other']];
module.exports = async function connect(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await User.init();
  await FileOperation.init();
  await Category.init();
  for (const [i, [name, slug]] of categories.entries()) await Category.updateOne({ slug }, { $setOnInsert: { name, slug, sortOrder: i, isActive: true } }, { upsert: true });
};
