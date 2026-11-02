# MotoClinicz: Viva guide

MotoClinicz (*Check-up. Fix-up. Gear up.*): a cloud-based vehicle service management system. React + Node.js/Express + MongoDB Atlas. Three roles: Customer, Service Center, Admin.

## 1. The system in one minute
A customer adds vehicles, finds a nearby verified service center, and books a one-hour slot. The center accepts, inspects the vehicle, recommends extra repairs (the customer approves or rejects each one), does the work with photo proof, and generates a GST bill with a PDF and QR code. The customer pays by UPI (demo) or at the counter, collects the vehicle with a 4-digit pickup code, and then rates the center. The admin verifies centers, watches revenue and analytics, and handles complaints. Reminders and notifications keep customers informed.

## 2. Architecture
```
Browser (React, Vite)  --HTTPS REST + JWT-->  Express API (Node 20)  -->  MongoDB Atlas
        \--Socket.IO (live updates)-----------/        |--> Cloudinary (photos)
                                                       |--> Brevo (email)
                                                       \--> Google Maps (optional)
```
- **Frontend** on Vercel, **backend** on Render, **database** on MongoDB Atlas (all free tiers).
- Routes -> controllers -> services -> models. Validation in routes (express-validator), business rules in controllers/services, data rules in Mongoose models and database indexes.

## 3. Data model (main collections)
| Collection | Holds |
|---|---|
| User | name, email, bcrypt password hash, role, email preference |
| ServiceCenter | profile, brands, services + prices, working hours, slot capacity, GSTIN, UPI settings, map location, rating average and count |
| Vehicle | owner, details, odometer history, document expiry dates, last service |
| Booking | snapshot of service/vehicle/price, status history, recommendations, photos, parts used, bill (lines, GST, payment), pickup code |
| SlotSeat | one record per booked seat: the double-booking guard |
| VehicleHealth | one inspection of a vehicle (engine, brakes, tyres, battery, oil) |
| SparePart | stock, price, GST rate, low-stock level |
| Payment | an online UPI payment (submitted / confirmed / rejected) |
| Notification | per-user notification, with a dedupe key for reminders |
| Review | rating + comment + center reply (one per booking) |
| Complaint | a conversation between customer, center and admin |

## 4. Security (say this clearly)
- Passwords hashed with **bcrypt (12 rounds)**; login returns a signed **JWT**.
- **Authorization on the server**: `protect` checks the token, `authorize(role)` checks the role. Hiding a button is not security.
- **Ownership checks**: every query includes the logged-in owner, for example `{ _id, customer: req.user._id }`. Someone else's ID returns "not found".
- Input validated on the server; **Helmet**, **CORS** limited to our website, **rate limits** on login, booking and map calls.
- Secrets only in environment variables. Admin cannot self-register. Demo accounts are never created in production (`npm run seed:admin`).
- Pickup code: `crypto.randomInt`, stored with `select: false`, compared in constant time, locked after 5 wrong tries.
- Invoice QR: HMAC-SHA256 of the invoice with the server secret, so edited or fake invoices fail to verify.
- Server-side Google key never reaches the browser; the browser key is restricted to our website.

## 5. The ideas that make it correct (the "why")
| Topic | Idea |
|---|---|
| No double booking | A **unique index** on (center, date, slot, seat). The database decides who gets the last seat, so two requests at the same instant cannot both succeed. |
| Stock never negative | One atomic `findOneAndUpdate` with `stock >= qty` and `$inc: -qty`. |
| Invoice numbers | Atomic `$inc` counter per center: sequential and never repeated. |
| Money | Calculated in **paise** (integers) to avoid floating-point errors; CGST+SGST always add up to the full GST; total rounded to the rupee with a visible round-off line. |
| Customer consent | Extra repairs are separate records. Only **approved** ones can be done or billed; quality check is blocked while any decision is pending. |
| Workshop flow | A **state machine**: status moves only one step forward, with conditions (mechanic, inspection, bill). |
| Online payment | Amount comes from the stored bill, never the browser. Partial unique indexes allow one live payment per booking and one use of each UTR per center. Confirm is atomic and happens once. |
| Revenue | MongoDB aggregation (`$match`, `$facet`, `$group`) over **paid** bills, in India time. |
| Notifications | One listener turns the existing booking events into stored notifications + a live push (Socket.IO room per user). Reminders use a unique key, so running twice never duplicates. |
| Recommendation score | Weighted sum: distance 35, price 25, free slots 15, rating 15, experience 10 (each scaled 0..1). Ratings are **Bayesian-smoothed** so one 5-star review cannot beat 100 reviews at 4.8. |
| Distance | Haversine formula (straight line, no service needed); Google Routes adds road time. Everything falls back gracefully without a key. |
| Time zone | All dates use Asia/Kolkata even on a UTC cloud server. |
| Soft delete | Vehicles/parts are archived, not deleted, so old bills keep working. |

## 6. Likely questions
1. **Why MongoDB?** Flexible documents suit bookings with nested bills/recommendations; Atlas is a managed cloud database; unique/partial indexes give the guarantees we need.
2. **How do you stop two customers booking the last slot?** (Unique seat index. See section 5.)
3. **Where is authorization done?** On the server, in middleware; the React redirect is only convenience.
4. **How is the bill worked out?** Booked price + approved repairs + parts used; GST per line (18% service, part's own rate), split CGST/SGST, paise arithmetic.
5. **How is the invoice proven genuine?** HMAC over booking id, invoice number and total with the server secret; the QR link carries the code; the server compares.
6. **Why a pickup code?** It proves the owner is present at handover; the center never sees it in lists or events.
7. **Is the UPI payment real?** No, a demo: the customer pays the center's UPI ID from their own app and sends the UTR; the center confirms. Real gateways (Razorpay) work the same way with a webhook instead of the manual confirm.
8. **How do reminders run on free hosting?** Render free servers sleep, so an external timer calls `POST /api/internal/reminders` with a secret header once a day.
9. **What if Google Maps or Brevo is down or has no key?** Maps falls back to a straight-line estimate; email is skipped; neither can break a booking.
10. **How is the score explained to the user?** "Match 86%" with reasons; weights are constants in one file.
11. **How do you test?** Automated tests (`npm test`) for GST, scoring, reminders, maintenance, distance and UPI rules; a manual checklist for the database-dependent flows (concurrency test described in the Phase 4 README).
12. **What would you add next?** Real payment gateway, mechanic logins, push notifications, multi-state IGST.
13. **How do reviews stay honest?** Only the customer of a **completed** booking can review it, once (unique index on booking); the center can reply but cannot edit or delete.
14. **How do complaints work?** Raised once the vehicle is at the workshop; one open complaint per booking (partial unique index); a thread between customer, center and admin; closed by the customer ("solved") or by the admin.
15. **What does the admin see?** Platform analytics (bookings, cancellation rate, ratings, top services/centers), revenue, centers to verify, complaints.

## 7. Ten-minute demo script
1. **Admin** logs in: dashboard stats, analytics and revenue; verifies a new center.
2. **Center** (Kaveri): profile, location on the map, services and prices, hours, parts stock, payment settings.
3. **Customer**: Find Centers (map + distance), Book Service: show Match %, Best match, sort options; book a slot.
4. **Center**: accept (the customer's bell lights up live), then Workshop: receive vehicle, inspect, assign mechanic, recommend a repair.
5. **Customer**: approve one repair, reject another (live).
6. **Center**: start work, mark done, add a part (stock drops), quality check, **generate final bill**, download PDF, ready for pickup.
7. **Customer**: pay by UPI QR, send the reference. **Center**: confirm. Show the pickup code.
8. **Center**: hand over with the code. **Customer**: review with stars. Show the QR verify page.
9. **Customer**: raise a complaint; **Center** replies; **Admin** resolves it.
10. Show `npm test` passing.

## 8. Final test checklist (tick before the viva)
- [ ] Register customer and center; admin verifies the center
- [ ] Add vehicle, edit, upload photo, set document dates
- [ ] Center setup complete (brands, services, hours, mechanics, parts, GSTIN, UPI, location)
- [ ] Book, reschedule, cancel; double-booking blocked; live slot update in two windows
- [ ] Full workshop flow through to Completed; repairs consent works
- [ ] Bill totals match the README example; PDF opens; QR verifies; edited code fails
- [ ] Wrong pickup code 5 times locks; new code unlocks
- [ ] UPI submit, reject, resend, confirm; counter payment still works
- [ ] Notifications live + `npm run reminders` creates reminders once
- [ ] Map, distance, score, sort; works with Google keys off
- [ ] Review once only; complaint thread; admin resolve
- [ ] Revenue and analytics numbers agree with the bills
- [ ] `npm test` passes; frontend `npm run build` succeeds
- [ ] Deployed site works end to end; `.env` files are not in GitHub
