import mongoose from 'mongoose';
import { defaultWorkingHours } from '../constants/services.js';

// A UPI ID looks like name@bank (for example kaveri.motors@okaxis).
export const UPI_ID = /^[a-z0-9.\-_]{2,60}@[a-z]{2,30}$/;

const offeredServiceSchema =new mongoose.Schema({
  key: { type: String, required: true },
  vehicleType: { type: String, enum: ['Car', 'Bike'], required: true },
  price: { type: Number, required: true, min: 0 },          // starting price in ₹, before parts and GST
  durationMins: { type: Number, required: true, min: 15, max: 480 },
  notes: { type: String, trim: true, maxlength: 200 },
  isActive: { type: Boolean, default: true }
});

const dayHoursSchema = new mongoose.Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
    isOpen: { type: Boolean, default: true },
    open: { type: String, default: '09:00' },
    close: { type: String, default: '18:00' },
    breakStart: { type: String, default: '' },
    breakEnd: { type: String, default: '' }
  },
  { _id: false }
);

const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // 'YYYY-MM-DD' (local date, no time zone surprises)
    reason: { type: String, trim: true, maxlength: 100 }
  },
  { _id: false }
);

// A tow truck the center sends to customers who break down on the way.
export const TOW_VEHICLE_TYPES = ['flatbed', 'wheel_lift', 'bike_carrier'];
const towContactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },     // driver or desk, e.g. "Ravi (driver)"
  phone: { type: String, required: true, trim: true, maxlength: 15 },
  vehicleType: { type: String, enum: TOW_VEHICLE_TYPES, default: 'flatbed' }
});

// Ways a customer can pay a center.
export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'netbanking', 'emi'];

// The methods a center accepts. Centers that never chose take cash, plus UPI if online UPI is on.
export const acceptedMethods = (c) => {
  const ps = c?.paymentSettings || {};
  if (ps.methods?.length) return PAYMENT_METHODS.filter((m) => ps.methods.includes(m));
  return ps.acceptsUpi ? ['cash', 'upi'] : ['cash'];
};

// Showroom / workshop photos customers see when they search (like a Google business listing).
export const MAX_CENTER_PHOTOS = 10;
const centerPhotoSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },   // Cloudinary id, used to delete the image
  caption: { type: String, trim: true, maxlength: 120 },
  isCover: { type: Boolean, default: false }      // the main photo shown first on the center's card
});

// Photos as customers see them: cover first, without storage ids.
export const publicPhotos = (c) => [...(c.photos || [])]
  .sort((a, b) => Number(b.isCover) - Number(a.isCover))
  .map((p) => ({ _id: p._id, url: p.url, caption: p.caption || '' }));

const serviceCenterSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    pincode: { type: String, required: true, match: /^\d{6}$/ },
    phone: { type: String, required: true, trim: true, maxlength: 15 },

    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'suspended'],
      default: 'pending',
      index: true
    },
    verificationNote: { type: String, trim: true, maxlength: 300 },
    verifiedAt: Date,

    // Phase 3: what the center works on and when
    brands: {
      Car: { type: [String], default: [] },
      Bike: { type: [String], default: [] }
    },
    services: { type: [offeredServiceSchema], default: [] },
    workingHours: { type: [dayHoursSchema], default: defaultWorkingHours },
    slotSettings: {
      slotMinutes: { type: Number, default: 60 },              // fixed one-hour slots
      capacityPerSlot: { type: Number, default: 2, min: 1, max: 20 },
      bookingWindowDays: { type: Number, default: 30, min: 1, max: 90 }
    },
    holidays: { type: [holidaySchema], default: [] },

    // Phase 6: billing
    gstin: { type: String, trim: true, uppercase: true, match: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/ },
    invoiceSeq: { type: Number, default: 0 },  // last invoice number used

    // Phase 10: average of customer reviews, kept up to date whenever a review is added
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },

    // Phase 9: where the center is on the map (set by the owner; used for distance and the map)
    location: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
      source: { type: String, enum: ['device', 'address', 'map', 'seed'] }   // how it was found
    },

    photos: { type: [centerPhotoSchema], default: [] },

    // The center's Google listing, found once and remembered (Google allows storing place IDs) so the
    // details page reads it by ID instead of searching each time. id null = no listing matched.
    // searched: the name and pin it was searched for; a new name or pin searches again.
    googlePlace: { id: String, searched: String, checkedAt: Date },

    // Roadside help: customers stuck on the way can find this center's tow trucks and request a tow.
    towing: {
      enabled: { type: Boolean, default: false },
      radiusKm: { type: Number, default: 25, min: 1, max: 200 },     // how far the trucks go
      available24x7: { type: Boolean, default: false },              // otherwise: during working hours
      charges: { type: String, trim: true, maxlength: 200 },         // e.g. "₹1,500 up to 10 km, then ₹40/km"
      contacts: { type: [towContactSchema], default: [] }
    },

    // Phase 7: where customers pay online (demo UPI; the center confirms each payment by hand)
    paymentSettings: {
      acceptsUpi: { type: Boolean, default: false },
      upiId: { type: String, trim: true, lowercase: true, match: UPI_ID },
      payeeName: { type: String, trim: true, maxlength: 60 },
      // How customers can pay at this center (shown on bookings and bills).
      methods: { type: [{ type: String, enum: PAYMENT_METHODS }], default: undefined },
      // The center's own GPay / PhonePe / Paytm QR image, shown when the customer pays.
      upiQr: { url: String, publicId: String },
      // On: the bill must be paid (online, or recorded at the counter) before the vehicle is handed over,
      // and the customer's pickup code stays hidden until then. Off: payment is taken at handover.
      payBeforePickup: { type: Boolean, default: false }
    }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Indexes used when customers search for centers (Phase 4).
serviceCenterSchema.index({ verificationStatus: 1, 'brands.Car': 1 });
serviceCenterSchema.index({ verificationStatus: 1, 'brands.Bike': 1 });

// What is still missing before customers can book.
serviceCenterSchema.virtual('setup').get(function setup() {
  const brands = (this.brands?.Car?.length || 0) + (this.brands?.Bike?.length || 0) > 0;
  const services = (this.services || []).some((s) => s.isActive);
  const hours = (this.workingHours || []).some((d) => d.isOpen);
  return { brands, services, hours, complete: brands && services && hours };
});

export default mongoose.model('ServiceCenter', serviceCenterSchema);
