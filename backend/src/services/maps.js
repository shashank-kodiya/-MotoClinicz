// Google Maps Platform calls, made from the server so the key never reaches the browser.
// GOOGLE_MAPS_SERVER_KEY needs these APIs switched on: Geocoding, Routes, Places (New).
// Without a key every function returns null and the app falls back to straight-line distance.
export const mapsReady = () => !!process.env.GOOGLE_MAPS_SERVER_KEY;

const key = () => process.env.GOOGLE_MAPS_SERVER_KEY;
const TIMEOUT_MS = 8000;

// Small cache so repeated searches don't cost money: entries last 10 minutes unless a longer time is given.
const cache = new Map();
const TTL = 10 * 60 * 1000;
function remember(k, value, ttl = TTL) {
  if (cache.size > 500) cache.clear();
  cache.set(k, { value, until: Date.now() + ttl });
  return value;
}
function recall(k) {
  const hit = cache.get(k);
  return hit && Date.now() < hit.until ? hit.value : undefined;
}

async function call(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Google returned ${res.status}`);
  return body;
}

// Address -> { lat, lng, formatted } (Geocoding API). null if not found or no key.
export async function geocode(address) {
  if (!mapsReady()) return null;
  const k = `geo:${address.toLowerCase()}`;
  const hit = recall(k);
  if (hit !== undefined) return hit;
  const q = new URLSearchParams({ address, region: 'in', key: key() });
  const body = await call(`https://maps.googleapis.com/maps/api/geocode/json?${q}`);
  if (body.status === 'ZERO_RESULTS') return remember(k, null);
  if (body.status !== 'OK') throw new Error(body.error_message || `Geocoding: ${body.status}`);
  const r = body.results[0];
  return remember(k, { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address });
}

// Driving distance and time between two points (Routes API, with live traffic). null if no key.
export async function drivingRoute(from, to) {
  if (!mapsReady()) return null;
  const k = `route:${from.lat.toFixed(3)},${from.lng.toFixed(3)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const hit = recall(k);
  if (hit !== undefined) return hit;
  const body = await call('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE'
    })
  });
  const r = body.routes?.[0];
  if (!r) return remember(k, null);
  return remember(k, {
    distanceKm: Math.round(r.distanceMeters / 100) / 10,
    minutes: Math.max(1, Math.round(parseInt(r.duration, 10) / 60)),
    estimated: false,
    polyline: r.polyline?.encodedPolyline || null   // the road path, drawn on the customer's map
  });
}

// Car repair shops around a point (Places API New, "Nearby Search"). null if no key.
export async function nearbyGarages(at, radiusKm) {
  if (!mapsReady()) return null;
  const k = `places:${at.lat.toFixed(2)},${at.lng.toFixed(2)}:${radiusKm}`;
  const hit = recall(k);
  if (hit !== undefined) return hit;
  const body = await call('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key(),
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.currentOpeningHours.openNow'
    },
    body: JSON.stringify({
      includedTypes: ['car_repair'],
      maxResultCount: 12,
      rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: { latitude: at.lat, longitude: at.lng }, radius: Math.min(50000, radiusKm * 1000) } }
    })
  });
  return remember(k, (body.places || []).map((p) => ({
    placeId: p.id,
    name: p.displayName?.text,
    address: p.formattedAddress,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating,
    ratings: p.userRatingCount,
    openNow: p.currentOpeningHours?.openNow,
    url: p.googleMapsUri
  })));
}

// ---- A center's Google listing: opening hours, phone, website and Google Maps link ----
// Ratings and reviews are not used: the app shows only its own customers' reviews.
// To keep Google costs and daily limits low, the listing is FOUND once (Text Search, ID only) and its
// place ID is saved on the center; after that it is READ by ID (Place Details), cached for 6 hours.
const DETAIL_FIELDS = ['id', 'displayName', 'googleMapsUri', 'websiteUri', 'nationalPhoneNumber', 'currentOpeningHours.openNow', 'regularOpeningHours.weekdayDescriptions', 'photos'];
const DETAILS_TTL = 6 * 60 * 60 * 1000;

// Finds the Google listing of one of our centers near its pin. Returns the place ID, or null if none matches.
// Only a listing within ~300 m whose name shares two distinctive words with ours is accepted,
// so a neighbouring business is never taken for this one.
export async function findGooglePlaceId(name, at) {
  if (!mapsReady()) return null;
  const body = await call('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'places.id,places.displayName,places.location' },
    body: JSON.stringify({
      textQuery: /servic/i.test(name) ? name : `${name} service`,
      maxResultCount: 6,
      locationBias: { circle: { center: { latitude: at.lat, longitude: at.lng }, radius: 500 } }
    })
  });
  // Compare only the distinctive words of our name: not the area after " - " ("Kanchana Hyundai - Surathkal"), and not generic words.
  const GENERIC = new Set(['sales', 'service', 'services', 'motor', 'motors', 'showroom', 'center', 'centre', 'authorised', 'authorized',
    'dealer', 'dealership', 'the', 'and', 'pvt', 'ltd', 'private', 'limited', 'mangalore', 'mangaluru', 'car', 'cars', 'workshop']);
  const words = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !GENERIC.has(w)));
  const ours = words(name.split(' - ')[0]);
  const needed = Math.min(2, ours.size || 1);
  const near = (p) => {
    const dLat = (p.location.latitude - at.lat) * 111;
    const dLng = (p.location.longitude - at.lng) * 111 * Math.cos((at.lat * Math.PI) / 180);
    return Math.hypot(dLat, dLng) <= 0.3;
  };
  const shared = (p) => [...words(p.displayName?.text)].filter((w) => ours.has(w)).length;
  // Several listings can share a building (sales showroom and workshop): prefer the one with "service" in its name.
  const matches = (body.places || []).filter((p) => p.location && near(p) && shared(p) >= needed);
  return (matches.find((p) => /servic/i.test(p.displayName?.text || '')) || matches[0])?.id || null;
}

// Reads a listing by its place ID (cheaper than a search, and no daily search limit). null if no key.
export async function googlePlaceDetails(placeId) {
  if (!mapsReady() || !placeId) return null;
  const k = `place:${placeId}`;
  const hit = recall(k);
  if (hit !== undefined) return hit;
  const place = await call(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': DETAIL_FIELDS.join(',') }
  });
  // Photo files: ask Google for a short-lived link to each image, so the key never reaches the browser.
  const photos = [];
  for (const ph of (place.photos || []).slice(0, 6)) {
    try {
      const media = await call(`https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=1000&skipHttpRedirect=true&key=${key()}`);
      if (media.photoUri) photos.push({ url: media.photoUri, author: ph.authorAttributions?.[0]?.displayName || '', authorUrl: ph.authorAttributions?.[0]?.uri || '' });
    } catch { /* skip this photo */ }
  }
  return remember(k, {
    name: place.displayName?.text,
    openNow: place.currentOpeningHours?.openNow ?? null,
    weekdayHours: place.regularOpeningHours?.weekdayDescriptions || [],
    phone: place.nationalPhoneNumber || '',
    website: place.websiteUri || '',
    url: place.googleMapsUri || '',
    photos
  }, DETAILS_TTL);
}

// Search and read in one go (used by scripts and tests). null if no listing matches.
export async function googleListing(name, at) {
  return googlePlaceDetails(await findGooglePlaceId(name, at));
}
