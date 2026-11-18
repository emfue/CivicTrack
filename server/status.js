require('dotenv').config();
const mongoose = require('mongoose');
const { changeStatus } = require('./services/status');
async function main() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Status utility requires NODE_ENV=development.');
  const [id, next] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGODB_URI); const previous = await changeStatus(id, next);
  console.log(`Updated ${id}: ${previous} -> ${next}`);
}
main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
