import mongoose from 'mongoose';

export async function connectDB(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is missing. Copy .env.example to .env and add your MongoDB Atlas connection string.');
  }
  mongoose.set('strictQuery', true);
  // An Atlas string with no database name (".../?retryWrites...") would use the shared "test" database,
  // so SVMS keeps its own one: MONGO_DB_NAME, or "svms" by default.
  const named = /^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(uri);
  const dbName = process.env.MONGO_DB_NAME || (named ? undefined : 'svms');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, ...(dbName ? { dbName } : {}) });
  console.log(`MongoDB connected: ${mongoose.connection.host} (database: ${mongoose.connection.name})`);
}

// Builds every index (including the unique ones that prevent double booking)
// before the server starts taking requests.
// The SlotSeat index is essential (it is what stops double booking), so failing to build it stops the server.
// Any other index problem is only reported, because the app also checks those rules in code.
// A short Wi-Fi or Atlas drop ("connection ... closed", "pool was cleared") is retried a few times
// instead of stopping the server.
const ESSENTIAL = ['SlotSeat'];
const NETWORK_ERROR = /connection|pool|timed out|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function buildIndexes(model) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // init() remembers its first result, so later attempts ask for the indexes directly.
      return attempt === 1 ? await model.init() : await model.createIndexes();
    } catch (err) {
      if (attempt >= 4 || !NETWORK_ERROR.test(err.message)) throw err;
      console.warn(`Connection dropped while preparing ${model.modelName}; trying again (${attempt}/3)...`);
      await wait(attempt * 2000);
    }
  }
}

export async function ensureIndexes() {
  for (const model of Object.values(mongoose.models)) {
    try {
      await buildIndexes(model);
    } catch (err) {
      if (ESSENTIAL.includes(model.modelName)) {
        throw new Error(`Could not create the ${model.modelName} index: ${err.message}`);
      }
      console.warn(`Index warning for ${model.modelName}: ${err.message}`);
    }
  }
}
