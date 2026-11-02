// Smart recommendation score (0 to 100) for the centers found by a booking search.
// It is plain arithmetic, so it can be explained and checked:
//   Distance     35%  0 km = full marks, 25 km or more = none (only when the customer shares a location)
//   Price        25%  the cheapest center gets full marks; others get cheapest / their price
//   Availability 15%  share of the day's slots that are still free
//   Rating       15%  customer reviews, smoothed so one review can't swing the score (see below)
//   Experience   10%  completed jobs on this platform, full marks at 50
// If there is no distance, the other four weights are scaled up so the score still runs to 100.
export const WEIGHTS = { distance: 35, price: 25, availability: 15, rating: 15, experience: 10 };
export const MAX_DISTANCE_KM = 25;
export const FULL_EXPERIENCE_JOBS = 50;
// A center with no reviews is treated as "average-good" (4.0 stars worth 3 reviews) and moves away from
// that as real reviews arrive. This is a Bayesian average: it keeps a single 5-star review from beating
// a center with 100 reviews at 4.8.
export const PRIOR_MEAN = 4;
export const PRIOR_WEIGHT = 3;

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const smoothedRating = (avg, count) => ((count || 0) * (avg || 0) + PRIOR_WEIGHT * PRIOR_MEAN) / ((count || 0) + PRIOR_WEIGHT);

// entry: { price, distanceKm|null, freeSlots, totalSlots, completedJobs, ratingAvg, ratingCount }
export function scoreAll(entries) {
  const cheapest = Math.min(...entries.map((e) => e.price).filter((p) => p > 0), Infinity);
  const useDistance = entries.some((e) => e.distanceKm != null);
  const total = useDistance ? 100 : 100 - WEIGHTS.distance;

  return entries.map((e) => {
    const stars = smoothedRating(e.ratingAvg, e.ratingCount);
    const parts = {
      distance: e.distanceKm != null ? clamp01(1 - e.distanceKm / MAX_DISTANCE_KM) : 0,
      price: e.price > 0 && Number.isFinite(cheapest) ? clamp01(cheapest / e.price) : 1,
      availability: e.totalSlots ? clamp01(e.freeSlots / e.totalSlots) : 0,
      rating: clamp01((stars - 1) / 4),
      experience: clamp01((e.completedJobs || 0) / FULL_EXPERIENCE_JOBS)
    };
    let raw = parts.price * WEIGHTS.price + parts.availability * WEIGHTS.availability + parts.rating * WEIGHTS.rating + parts.experience * WEIGHTS.experience;
    if (useDistance) raw += parts.distance * WEIGHTS.distance;
    const score = Math.round((raw / total) * 100);

    // Short reasons shown to the customer.
    const reasons = [];
    if (e.distanceKm != null && parts.distance >= 0.8) reasons.push('Close to you');
    if (parts.price >= 0.999) reasons.push('Lowest price');
    if ((e.ratingCount || 0) >= 3 && e.ratingAvg >= 4.5) reasons.push('Highly rated');
    if (e.totalSlots && parts.availability >= 0.5) reasons.push('Plenty of free slots');
    else if (e.freeSlots === 0) reasons.push('No free slots on this date');
    if (parts.experience >= 0.5) reasons.push('Experienced on MotoClinicz');
    return { score, reasons };
  });
}
