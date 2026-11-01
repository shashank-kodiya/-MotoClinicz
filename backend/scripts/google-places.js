// Finds and saves the Google place ID of every verified center that has a map pin, so customers'
// visits to the details page never need a Google search (they read the listing by ID instead).
// Centers already saved (same name and pin, checked in the last 30 days) are skipped, so it is safe to
// run again after adding centers. Uses one Google Text Search per new center.
// Run:  npm run google:places        (needs GOOGLE_MAPS_SERVER_KEY and MONGO_URI in backend/.env)
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import ServiceCenter from '../src/models/ServiceCenter.js';
import { centerGoogleListing } from '../src/controllers/mapsController.js';
import { mapsReady } from '../src/services/maps.js';

if (!mapsReady()) {
  console.error('GOOGLE_MAPS_SERVER_KEY is not set in backend/.env');
  process.exit(1);
}
await connectDB(process.env.MONGO_URI);

const centers = await ServiceCenter.find({ verificationStatus: 'verified', 'location.lat': { $exists: true } })
  .select('name location googlePlace').sort({ name: 1 }).lean();
const out = { found: 0, noMatch: 0, alreadySaved: 0, failed: 0 };

for (const c of centers) {
  const before = c.googlePlace?.checkedAt;
  try {
    const listing = await centerGoogleListing(c);
    const after = (await ServiceCenter.findById(c._id).select('googlePlace').lean()).googlePlace;
    const fresh = String(before) !== String(after?.checkedAt);
    if (!fresh) out.alreadySaved += 1;
    else if (after?.id) out.found += 1;
    else out.noMatch += 1;
    console.log(`${fresh ? (after?.id ? 'saved   ' : 'no match') : 'already '} ${c.name}${listing?.name ? `  ->  ${listing.name}` : ''}`);
  } catch (err) {
    out.failed += 1;
    console.log(`failed   ${c.name}: ${err.message}`);
    if (/quota/i.test(err.message)) { console.log('\nGoogle daily quota reached. Run this again after the reset (about 1:30 PM India time).'); break; }
  }
}

console.log(`\n${centers.length} centers: ${out.found} saved now, ${out.alreadySaved} already saved, ${out.noMatch} with no Google listing, ${out.failed} failed.`);
await mongoose.disconnect();
