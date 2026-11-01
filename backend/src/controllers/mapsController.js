import ServiceCenter, { publicPhotos, acceptedMethods } from '../models/ServiceCenter.js';
import AppError, { asyncHandler } from '../utils/AppError.js';
import { haversineKm, hasLocation, estimateRoute } from '../services/geo.js';
import { mapsReady, geocode, drivingRoute, nearbyGarages, findGooglePlaceId, googlePlaceDetails } from '../services/maps.js';
import { serviceByKey, DAYS } from '../constants/services.js';
import { dayOfWeek, toMinutes } from '../utils/slots.js';
import { nowIST, addDaysStr } from '../utils/time.js';

const round1 = (n) => Math.round(n * 10) / 10;

// ---------------- Customer ----------------

// GET /api/maps/status   Tells the app whether Google is set up (otherwise distances are straight-line estimates).
export const status = (req, res) => res.json({ google: mapsReady() });

// GET /api/maps/centers?lat=&lng=&radiusKm=   Verified centers that have a map location, nearest first.
export const centersOnMap = asyncHandler(async (req, res) => {
  const me = { lat: req.query.lat, lng: req.query.lng };
  const centers = await ServiceCenter.find({ verificationStatus: 'verified', 'location.lat': { $exists: true }, 'location.lng': { $exists: true } })
    .select('name address city pincode phone description brands location ratingAvg ratingCount photos').limit(300).lean();
  let list = centers.filter(hasLocation).map((c) => ({
    _id: c._id, name: c.name, address: c.address, city: c.city, pincode: c.pincode, phone: c.phone, description: c.description,
    brands: c.brands, ratingAvg: c.ratingAvg || 0, ratingCount: c.ratingCount || 0, lat: c.location.lat, lng: c.location.lng, photos: publicPhotos(c),
    distanceKm: me.lat != null ? round1(haversineKm(me, c.location)) : null
  }));
  if (me.lat != null) {
    if (req.query.radiusKm) list = list.filter((c) => c.distanceKm <= req.query.radiusKm);
    list.sort((a, b) => a.distanceKm - b.distanceKm);
  }
  res.json({ google: mapsReady(), centers: list });
});

// GET /api/maps/route?centerId=&lat=&lng=   Driving distance and time from the customer to a center.
export const routeToCenter = asyncHandler(async (req, res) => {
  const center = await ServiceCenter.findOne({ _id: req.query.centerId, verificationStatus: 'verified' }).select('location name');
  if (!center) throw new AppError('Service center not found.', 404);
  if (!hasLocation(center)) throw new AppError('This center has not set its map location yet.', 404);
  const from = { lat: req.query.lat, lng: req.query.lng };
  const straightKm = haversineKm(from, center.location);
  try {
    const r = await drivingRoute(from, center.location);
    if (r) return res.json({ ...r, straightKm: round1(straightKm), directionsUrl: directionsUrl(from, center.location) });
  } catch (err) {
    console.warn(`Google Routes failed, using an estimate: ${err.message}`); // never block the customer on this
  }
  res.json({ ...estimateRoute(straightKm), straightKm: round1(straightKm), directionsUrl: directionsUrl(from, center.location) });
});

// "Open · Closes 7 PM" / "Closed · Opens 9 AM Mon", worked out from the center's own hours in Indian time.
const clock = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
export function openStatus(center) {
  const { date, minutes } = nowIST();
  const dayHours = (d) => (center.workingHours || []).find((h) => h.day === dayOfWeek(d));
  const holiday = (d) => (center.holidays || []).find((h) => h.date === d);
  const today = dayHours(date);
  if (!holiday(date) && today?.isOpen) {
    const open = toMinutes(today.open); const close = toMinutes(today.close);
    const bS = today.breakStart ? toMinutes(today.breakStart) : null; const bE = today.breakEnd ? toMinutes(today.breakEnd) : null;
    if (bS !== null && bE !== null && minutes >= bS && minutes < bE) return { isOpen: false, label: `On break · Reopens ${clock(today.breakEnd)}` };
    if (minutes >= open && minutes < close) {
      return { isOpen: true, label: `Open · Closes ${clock(today.close)}`, closingSoon: close - minutes <= 60 };
    }
    if (minutes < open) return { isOpen: false, label: `Closed · Opens ${clock(today.open)}` };
  }
  for (let i = 1; i <= 14; i += 1) {
    const d = addDaysStr(date, i);
    const h = dayHours(d);
    if (h?.isOpen && !holiday(d)) {
      return { isOpen: false, label: `Closed · Opens ${clock(h.open)} ${i === 1 ? 'tomorrow' : DAYS[dayOfWeek(d)].slice(0, 3)}`, reason: holiday(date)?.reason };
    }
  }
  return { isOpen: false, label: 'Closed' };
}

// The center's Google listing. The place is searched for once (and again after 30 days, or when the
// center's name or pin changes) and its ID is saved; every other view reads it by ID, which is cheaper
// and does not use the daily search limit. A "no match" is remembered too, so it isn't searched on every view.
const RESEARCH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export async function centerGoogleListing(c) {
  if (!mapsReady()) return null;
  const searched = `${c.name}|${c.location.lat.toFixed(5)},${c.location.lng.toFixed(5)}`;
  const saved = c.googlePlace;
  const fresh = saved?.checkedAt && saved.searched === searched && Date.now() - new Date(saved.checkedAt).getTime() < RESEARCH_AFTER_MS;
  if (fresh) {
    if (!saved.id) return null;
    try {
      return await googlePlaceDetails(saved.id);
    } catch (err) {
      // Google sometimes retires a place ID: forget it and search again next time.
      await ServiceCenter.updateOne({ _id: c._id }, { $unset: { googlePlace: 1 } });
      throw err;
    }
  }
  const id = await findGooglePlaceId(c.name, c.location);
  await ServiceCenter.updateOne({ _id: c._id }, { $set: { googlePlace: { id: id || null, searched, checkedAt: new Date() } } });
  return id ? googlePlaceDetails(id) : null;
}

// GET /api/maps/centers/:id   Everything for the center's details page (like a Google Maps listing).
export const centerDetails = asyncHandler(async (req, res) => {
  const c = await ServiceCenter.findOne({ _id: req.params.id, verificationStatus: 'verified' })
    .select('name description address city pincode phone brands services workingHours holidays location ratingAvg ratingCount photos createdAt googlePlace paymentSettings.methods paymentSettings.acceptsUpi paymentSettings.payBeforePickup').lean();
  if (!c) throw new AppError('Service center not found.', 404);
  const { date } = nowIST();
  const located = hasLocation(c);
  let google = null;
  if (located) {
    try { google = await centerGoogleListing(c); } catch (err) { console.warn(`Google listing failed: ${err.message}`); }
  }
  res.json({
    _id: c._id, name: c.name, description: c.description, address: c.address, city: c.city, pincode: c.pincode, phone: c.phone,
    brands: c.brands,
    services: (c.services || []).filter((s) => s.isActive).map((s) => ({ key: s.key, name: serviceByKey(s.key)?.name || s.key, vehicleType: s.vehicleType, price: s.price, durationMins: s.durationMins, notes: s.notes })),
    workingHours: [...(c.workingHours || [])].sort((a, b) => a.day - b.day),
    upcomingHolidays: (c.holidays || []).filter((h) => h.date >= date).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
    todayDay: dayOfWeek(date),
    status: openStatus(c),
    ...(located ? { lat: c.location.lat, lng: c.location.lng } : {}),
    ratingAvg: c.ratingAvg || 0, ratingCount: c.ratingCount || 0,
    photos: publicPhotos(c),
    paymentMethods: acceptedMethods(c),
    payBeforePickup: !!c.paymentSettings?.payBeforePickup,
    memberSince: c.createdAt,
    google,
    googleEnabled: mapsReady()
  });
});

// Opens Google Maps with directions already filled in (no API key needed).
const directionsUrl = (from, to) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;

// GET /api/maps/places?lat=&lng=&radiusKm=   Other garages around the customer from Google Places.
export const otherGarages = asyncHandler(async (req, res) => {
  if (!mapsReady()) return res.json({ available: false, places: [], message: 'Google Places is not set up on this server.' });
  const at = { lat: req.query.lat, lng: req.query.lng };
  let places;
  try {
    places = await nearbyGarages(at, req.query.radiusKm || 5);
  } catch (err) {
    console.warn(`Google Places failed: ${err.message}`);
    throw new AppError('Google Places did not answer. Try again in a moment.', 502);
  }
  // Leave out garages that are already on SVMS (same name within about 150 m), so nothing is listed twice.
  const ours = await ServiceCenter.find({ 'location.lat': { $exists: true } }).select('name location').lean();
  const fresh = places.filter((p) => !ours.some((c) => c.name.trim().toLowerCase() === (p.name || '').trim().toLowerCase() && haversineKm({ lat: p.lat, lng: p.lng }, c.location) < 0.15));
  res.json({
    available: true,
    places: fresh.map((p) => ({ ...p, distanceKm: round1(haversineKm(at, p)) })).sort((a, b) => a.distanceKm - b.distanceKm)
  });
});

// ---------------- Service center ----------------

async function myCenter(req) {
  const center = await ServiceCenter.findOne({ owner: req.user._id });
  if (!center) throw new AppError('Service center profile not found.', 404);
  return center;
}

// PUT /api/center/location   body: { lat, lng }   (for example from "Use my current location" at the shop)
export const setLocation = asyncHandler(async (req, res) => {
  const center = await myCenter(req);
  center.location = { lat: req.body.lat, lng: req.body.lng, source: req.body.source || 'device' };
  await center.save();
  res.json(center);
});

// POST /api/center/location/from-address   Finds the map point for the saved address with Google Geocoding.
export const locationFromAddress = asyncHandler(async (req, res) => {
  if (!mapsReady()) throw new AppError('Finding a location from an address needs Google Maps to be set up on the server. Use "Use my current location" instead.', 503);
  const center = await myCenter(req);
  let found;
  try {
    found = await geocode(`${center.address}, ${center.city} ${center.pincode}, India`);
  } catch (err) {
    console.warn(`Geocoding failed: ${err.message}`);
    throw new AppError('Google could not look up the address right now. Try again, or use "Use my current location".', 502);
  }
  if (!found) throw new AppError('Google could not find this address. Check the address, city and PIN code, or use "Use my current location".', 422);
  center.location = { lat: found.lat, lng: found.lng, source: 'address' };
  await center.save();
  res.json(center);
});

// DELETE /api/center/location
export const clearLocation = asyncHandler(async (req, res) => {
  const center = await myCenter(req);
  center.location = undefined;
  await center.save();
  res.json(center);
});
