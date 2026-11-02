import Booking from '../models/Booking.js';
import Review from '../models/Review.js';
import Complaint, { COMPLAINT_CATEGORIES } from '../models/Complaint.js';
import ServiceCenter from '../models/ServiceCenter.js';
import User from '../models/User.js';
import AppError, { asyncHandler } from '../utils/AppError.js';
import { notify } from '../services/notifications.js';

// A complaint can be raised once the vehicle has reached the workshop.
const COMPLAINT_STATUSES_OK = ['vehicle_received', 'inspection', 'in_progress', 'quality_check', 'ready_for_pickup', 'completed'];

const firstName = (n = '') => n.trim().split(/\s+/)[0] || 'Customer';

// Keeps the center's average rating up to date. Computed from the reviews themselves each time,
// so it can never drift from the real data.
async function refreshRating(centerId) {
  const [r] = await Review.aggregate([{ $match: { center: centerId } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
  await ServiceCenter.updateOne({ _id: centerId }, { $set: { ratingAvg: r ? Math.round(r.avg * 10) / 10 : 0, ratingCount: r?.n || 0 } });
}

const ownerOf = async (centerId) => (await ServiceCenter.findById(centerId).select('owner').lean())?.owner;
const adminIds = async () => (await User.find({ role: 'admin', isActive: true }).select('_id').lean()).map((u) => u._id);

async function myCenter(req) {
  const c = await ServiceCenter.findOne({ owner: req.user._id }).select('_id');
  if (!c) throw new AppError('Service center profile not found.', 404);
  return c;
}

// ======================= Customer =======================

async function myCompletedOrOpenBooking(req) {
  const b = await Booking.findOne({ _id: req.params.id, customer: req.user._id }).select('bookingNo status center service customer');
  if (!b) throw new AppError('Booking not found.', 404);
  return b;
}

// GET /api/bookings/:id/feedback   My review and complaints for this booking.
export const bookingFeedback = asyncHandler(async (req, res) => {
  const b = await myCompletedOrOpenBooking(req);
  const [review, complaints] = await Promise.all([
    Review.findOne({ booking: b._id }).lean(),
    Complaint.find({ booking: b._id }).sort({ createdAt: -1 }).lean()
  ]);
  res.json({
    review,
    complaints,
    canReview: b.status === 'completed' && !review,
    canComplain: COMPLAINT_STATUSES_OK.includes(b.status) && !complaints.some((c) => c.isOpen)
  });
});

// POST /api/bookings/:id/review   body: { rating, comment }
export const createReview = asyncHandler(async (req, res) => {
  const b = await myCompletedOrOpenBooking(req);
  if (b.status !== 'completed') throw new AppError('You can review a service once your vehicle has been handed over.', 409);
  let review;
  try {
    review = await Review.create({ booking: b._id, center: b.center, customer: req.user._id, serviceName: b.service.name, rating: req.body.rating, comment: req.body.comment || undefined });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You have already reviewed this service.', 409);
    throw err;
  }
  await refreshRating(b.center);
  const owner = await ownerOf(b.center);
  if (owner) {
    await notify(owner, { type: 'feedback', title: `New ${review.rating}-star review`, body: `${firstName(req.user.name)} rated ${b.bookingNo}${review.comment ? `: “${review.comment.slice(0, 100)}”` : '.'}`, link: '/center/feedback' });
  }
  res.status(201).json(review);
});

// POST /api/bookings/:id/complaints   body: { category, description }
export const createComplaint = asyncHandler(async (req, res) => {
  const b = await myCompletedOrOpenBooking(req);
  if (!COMPLAINT_STATUSES_OK.includes(b.status)) throw new AppError('You can raise a complaint once your vehicle is at the workshop.', 409);
  let c;
  try {
    c = await Complaint.create({
      booking: b._id, center: b.center, customer: req.user._id, bookingNo: b.bookingNo,
      category: req.body.category, messages: [{ by: 'customer', text: req.body.description }]
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You already have an open complaint for this booking. Add a message to it instead.', 409);
    throw err;
  }
  const owner = await ownerOf(b.center);
  if (owner) await notify(owner, { type: 'feedback', title: 'New complaint', body: `${b.bookingNo}: ${req.body.category.replace(/_/g, ' ')}. Please respond.`, link: '/center/feedback', email: true });
  for (const id of await adminIds()) await notify(id, { type: 'feedback', title: 'New complaint', body: `${b.bookingNo}: ${req.body.category.replace(/_/g, ' ')}.`, link: '/admin/complaints' });
  res.status(201).json(c);
});

async function ownComplaint(req) {
  const c = await Complaint.findOne({ _id: req.params.cid, customer: req.user._id });
  if (!c) throw new AppError('Complaint not found.', 404);
  return c;
}

// POST /api/bookings/:id/complaints/:cid/messages   body: { text }
export const customerComplaintMessage = asyncHandler(async (req, res) => {
  const c = await ownComplaint(req);
  if (!c.isOpen) throw new AppError('This complaint is resolved. Raise a new one if the problem is back.', 409);
  c.messages.push({ by: 'customer', text: req.body.text });
  c.status = 'open';
  await c.save();
  const owner = await ownerOf(c.center);
  if (owner) await notify(owner, { type: 'feedback', title: 'Customer replied to a complaint', body: `${c.bookingNo}: ${req.body.text.slice(0, 120)}`, link: '/center/feedback' });
  res.json(c);
});

// PATCH /api/bookings/:id/complaints/:cid/resolve   "My problem is solved"
export const customerResolveComplaint = asyncHandler(async (req, res) => {
  const c = await ownComplaint(req);
  if (!c.isOpen) throw new AppError('This complaint is already resolved.', 409);
  c.status = 'resolved';
  c.isOpen = false;
  c.resolution = { by: 'customer', at: new Date() };
  await c.save();
  const owner = await ownerOf(c.center);
  if (owner) await notify(owner, { type: 'feedback', title: 'Complaint resolved', body: `The customer marked the complaint on ${c.bookingNo} as solved.`, link: '/center/feedback' });
  res.json(c);
});

// GET /api/bookings/centers/:centerId/reviews   Latest reviews of a verified center (first names only).
export const publicReviews = asyncHandler(async (req, res) => {
  const center = await ServiceCenter.findOne({ _id: req.params.centerId, verificationStatus: 'verified' }).select('name ratingAvg ratingCount');
  if (!center) throw new AppError('Service center not found.', 404);
  const list = await Review.find({ center: center._id }).sort({ createdAt: -1 }).limit(20).populate('customer', 'name').lean();
  res.json({
    ratingAvg: center.ratingAvg, ratingCount: center.ratingCount,
    reviews: list.map((r) => ({ _id: r._id, rating: r.rating, comment: r.comment, serviceName: r.serviceName, who: firstName(r.customer?.name), at: r.createdAt, reply: r.reply?.text ? r.reply : undefined }))
  });
});

// ======================= Service center =======================

// GET /api/center/reviews
export const centerReviews = asyncHandler(async (req, res) => {
  const center = await myCenter(req);
  const [list, c] = await Promise.all([
    Review.find({ center: center._id }).sort({ createdAt: -1 }).limit(100).populate('customer', 'name').lean(),
    ServiceCenter.findById(center._id).select('ratingAvg ratingCount').lean()
  ]);
  res.json({ ratingAvg: c.ratingAvg, ratingCount: c.ratingCount, reviews: list.map((r) => ({ ...r, customer: { name: firstName(r.customer?.name) } })) });
});

// PATCH /api/center/reviews/:id/reply   body: { text }
export const replyToReview = asyncHandler(async (req, res) => {
  const center = await myCenter(req);
  const r = await Review.findOneAndUpdate({ _id: req.params.id, center: center._id }, { $set: { reply: { text: req.body.text, at: new Date() } } }, { new: true });
  if (!r) throw new AppError('Review not found.', 404);
  await notify(r.customer, { type: 'feedback', title: 'The center replied to your review', body: req.body.text.slice(0, 140), link: `/customer/bookings/${r.booking}` });
  res.json(r);
});

// GET /api/center/complaints?status=
export const centerComplaints = asyncHandler(async (req, res) => {
  const center = await myCenter(req);
  const filter = { center: center._id };
  if (req.query.status) filter.status = req.query.status;
  res.json(await Complaint.find(filter).sort({ isOpen: -1, updatedAt: -1 }).limit(100).populate('customer', 'name phone').lean());
});

// POST /api/center/complaints/:id/messages   body: { text }
export const centerComplaintMessage = asyncHandler(async (req, res) => {
  const center = await myCenter(req);
  const c = await Complaint.findOne({ _id: req.params.id, center: center._id });
  if (!c) throw new AppError('Complaint not found.', 404);
  if (!c.isOpen) throw new AppError('This complaint is resolved.', 409);
  c.messages.push({ by: 'service_center', text: req.body.text });
  c.status = 'responded';
  await c.save();
  await notify(c.customer, { type: 'feedback', title: 'The center responded to your complaint', body: req.body.text.slice(0, 140), link: `/customer/bookings/${c.booking}`, email: true });
  res.json(c);
});

// ======================= Admin =======================

// GET /api/admin/complaints?status=
export const adminComplaints = asyncHandler(async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  res.json(await Complaint.find(filter).sort({ isOpen: -1, updatedAt: -1 }).limit(200)
    .populate('center', 'name city phone').populate('customer', 'name email phone').lean());
});

// POST /api/admin/complaints/:id/messages   body: { text }   Admin steps in.
export const adminComplaintMessage = asyncHandler(async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  if (!c) throw new AppError('Complaint not found.', 404);
  if (!c.isOpen) throw new AppError('This complaint is resolved.', 409);
  c.messages.push({ by: 'admin', text: req.body.text });
  c.status = 'responded';
  await c.save();
  const owner = await ownerOf(c.center);
  await notify(c.customer, { type: 'feedback', title: 'Message from MotoClinicz support', body: req.body.text.slice(0, 140), link: `/customer/bookings/${c.booking}`, email: true });
  if (owner) await notify(owner, { type: 'feedback', title: 'Message from MotoClinicz support', body: `${c.bookingNo}: ${req.body.text.slice(0, 120)}`, link: '/center/feedback' });
  res.json(c);
});

// PATCH /api/admin/complaints/:id/resolve   body: { note }
export const adminResolveComplaint = asyncHandler(async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  if (!c) throw new AppError('Complaint not found.', 404);
  if (!c.isOpen) throw new AppError('This complaint is already resolved.', 409);
  if (req.body.note) c.messages.push({ by: 'admin', text: req.body.note });
  c.status = 'resolved';
  c.isOpen = false;
  c.resolution = { by: 'admin', at: new Date() };
  await c.save();
  const owner = await ownerOf(c.center);
  await notify(c.customer, { type: 'feedback', title: 'Your complaint was resolved', body: req.body.note || `MotoClinicz support closed the complaint on ${c.bookingNo}.`, link: `/customer/bookings/${c.booking}`, email: true });
  if (owner) await notify(owner, { type: 'feedback', title: 'Complaint resolved by support', body: `${c.bookingNo} was closed by MotoClinicz support.`, link: '/center/feedback' });
  res.json(c);
});

export { COMPLAINT_CATEGORIES };
