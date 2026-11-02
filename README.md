# MotoClinicz

*Check-up. Fix-up. Gear up.*

A cloud-based vehicle service management system

Final-year project. React + Node.js/Express + MongoDB Atlas.
Three roles: **Customer**, **Service Center**, **Admin**.

## Project roadmap

| Phase | What gets built | Status |
|---|---|---|
| 1 | Project setup, MongoDB Atlas, register/login, JWT, role-based dashboards, admin verifies centers | Done |
| 2 | Customer vehicles (add/edit, brand/model, odometer, insurance/PUC/RC dates), vehicle photo upload (Cloudinary) | Done |
| 3 | Service center profile: brands, services, prices, working hours, slot capacity, mechanics | Done |
| 4 | Booking with safe slot capacity, reschedule/cancel, accept/reject, live slot updates (Socket.IO) | Done |
| 5 | Service status tracking, inspection and vehicle health records, repair recommendations with customer approval, photo proof | Done |
| 6 | Spare parts stock, billing with GST (live estimate, then final bill), PDF invoice with QR verification, pickup code, completed | Done |
| 7 | Demo UPI payments (UPI ID + QR), center payment settings, revenue dashboards | Done |
| 8 | Notifications + email (Brevo), daily reminder job (service by date/km, document expiry), maintenance suggestions | Done |
| 9 | Google Maps: map, current location, Places listings, Routes distance/time, smart recommendation score | Done |
| **10** | Reviews, complaints, admin analytics, deployment (Vercel + Render), testing, viva preparation | **This version (final)** |

Each phase comes as its own zip. Each one builds on the previous one, so test each phase before starting the next.

---

## Phase 10: Reviews, complaints, analytics, tests and deployment

The viva guide (architecture, security, questions and answers, demo script, final checklist) is in [docs/VIVA.md](docs/VIVA.md).

### What's new
**Customer**
- **Your feedback** on the booking page: after pickup, rate 1 to 5 stars with a comment (once per booking); see the center's reply
- **Report a problem** from the moment the vehicle is at the workshop: choose a category, describe it, then chat with the center and support; tap **My problem is solved** to close it
- **Stars and "Read reviews"** on every center in Book Service and Find Centers

**Service center**
- **Reviews** menu: average rating, every review with **Reply**, and the complaints inbox where you respond to customers

**Admin**
- **Analytics** on the dashboard: bookings per day, most booked services, status split, cancellation rate, average rating, open complaints, new customers, top centers
- **Complaints** page: see every complaint, step in with a message, or **Resolve** it with a note

**Everyone** gets notifications for new reviews, complaints and replies (and email for the important ones).

**Recommendation score** now includes **ratings**: distance 35%, price 25%, free slots 15%, rating 15%, experience 10%. A center with no reviews counts as "average-good" (4.0), and ratings are smoothed (Bayesian average) so one 5-star review can't beat 100 reviews at 4.8.

### Rules the server enforces
| Rule | Why |
|---|---|
| Only the customer of a **completed** booking can review it, and only once (unique index on the booking) | Honest reviews; no review bombing |
| The center can reply but cannot edit or delete a review | Reviews can't be hidden |
| The center's average rating is recomputed from the reviews each time | It can never drift from the real data |
| A complaint needs a booking that has reached the workshop; one unresolved complaint per booking (partial unique index) | No spam; one clear thread |
| Customers see only their own complaints, centers only theirs, admin all | Privacy |
| Review comments show only the customer's first name to others | Privacy |

### New API endpoints
| Who | Method | URL | Purpose |
|---|---|---|---|
| Customer | GET | `/api/bookings/:id/feedback` | My review and complaints for a booking |
| Customer | POST | `/api/bookings/:id/review` | `{ rating, comment }` |
| Customer | POST | `/api/bookings/:id/complaints` | `{ category, description }` |
| Customer | POST / PATCH | `/api/bookings/:id/complaints/:cid/messages` , `/resolve` | Reply / "solved" |
| Customer | GET | `/api/bookings/centers/:centerId/reviews` | Latest reviews of a center |
| Center | GET | `/api/center/reviews` | My reviews and rating |
| Center | PATCH | `/api/center/reviews/:id/reply` | `{ text }` |
| Center | GET / POST | `/api/center/complaints` , `/:id/messages` | Inbox / respond |
| Admin | GET | `/api/admin/analytics?from=&to=` | Platform analytics |
| Admin | GET / POST / PATCH | `/api/admin/complaints` , `/:id/messages` , `/:id/resolve` | Handle complaints |
| Timer | POST | `/api/internal/reminders` | Daily reminders (header `x-cron-secret`) |

### Automated tests
```powershell
cd backend
npm test
```
30 tests using Node's built-in test runner (no new packages) cover: the GST bill (the README example, CGST+SGST adding up, rejected repairs not billed, round-off), invoice verify codes and the pickup code, the recommendation score (weights, distance, price, availability, rating smoothing), service-due and suggestion rules, reminder steps, haversine distance, the UPI ID and link, and date validation. The checks that need a live database (double booking with 20 simultaneous bookings, stock locking) are in the manual checklist in [docs/VIVA.md](docs/VIVA.md).

### Test Phase 10
Use a finished booking (the demo Activa job: bill, ready for pickup, hand over). Window **A** = customer, **B** = Kaveri, **C** = admin.

| # | Window | Do this | Expected result |
|---|---|---|---|
| 1 | A | Open a booking that is **not** completed | "You can rate this service after you collect your vehicle" |
| 2 | B | Hand the vehicle over | Booking is Completed |
| 3 | A | Open the booking → choose 4 stars + comment → **Submit review** | "Thank you!"; the review is shown; submitting again is refused |
| 4 | B | **Reviews** menu | Average 4.0 (1 review); notification "New 4-star review"; write a reply → A sees it |
| 5 | A | Book Service → find centers | Kaveri shows ★ 4.0 (1) and **Read reviews** |
| 6 | A | **Report a problem** → Overcharging + description (10+ characters) | Sent; B and the admin get "New complaint" |
| 7 | A | Report a second problem on the same booking | Refused: you already have an open complaint |
| 8 | B | Reviews menu → Complaints → send a response | A sees it and gets a notification |
| 9 | A | Reply, then **My problem is solved** | Closed; B is told |
| 10 | A | Raise another complaint; C: **Complaints** → send a message, then **Resolve complaint** with a note | A and B are notified; it shows Resolved |
| 11 | C | Dashboard → **Analytics** | Bookings, cancellation rate, average rating 4.0, complaints, top services and centers |
| 12 | C | Change the range to Last 7 days | Numbers change |
| 13 | A | Open another customer's booking URL feedback | "Booking not found" |
| 14 | — | `npm test` | 30 passed |

### Deploy to the internet (free)
Deploy in this order: database, backend, frontend, then connect them.

**1. Database (MongoDB Atlas)**: you already have it. In **Network Access** add `0.0.0.0/0` (Render's address changes). Use a strong database password.

**2. Put the code on GitHub**
```powershell
cd C:\Users\ACER\OneDrive\Desktop\svms-phase6\svms
git init
git add .
git commit -m "SVMS final"
```
Create an empty repository on GitHub and run the two `git remote add` / `git push` commands it shows. `.env` files are ignored by `.gitignore`: check that none appear on GitHub.

**3. Backend on Render** (https://render.com)
- New → **Blueprint** → choose your repository (it reads `render.yaml`), or New → Web Service with root directory `backend`, build `npm install`, start `npm start`, health check `/api/health`.
- Fill the variables Render asks for: `MONGO_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and (if you use them) Cloudinary, Brevo and Google keys. `JWT_SECRET` and `CRON_SECRET` are generated for you. Leave `CLIENT_URL` for step 5.
- When it is live, open `https://<your-service>.onrender.com/api/health`: it should show `{"status":"ok"}`.
- Create the first admin on the live database: in the Render **Shell** run `npm run seed:admin`. This creates **only the admin**: the demo accounts have public passwords and must not exist online.

**4. Frontend on Vercel** (https://vercel.com)
- New Project → import the repository → **Root Directory** `frontend`. Framework: Vite (detected).
- Environment variables: `VITE_API_URL=https://<your-service>.onrender.com/api` and, if you use maps, `VITE_GOOGLE_MAPS_KEY`.
- Deploy. `frontend/vercel.json` makes page refreshes on `/customer/...` work.

**5. Connect them**
- In Render set `CLIENT_URL` to your Vercel address (for example `https://svms.vercel.app`; several can be separated by commas) and let it redeploy. This is what CORS and Socket.IO allow.
- If you restricted the Google browser key, add the Vercel address to its allowed websites.

**6. Daily reminders** (free Render servers sleep)
- `REMINDERS=off` is set in `render.yaml`. Instead, create a free timer at https://cron-job.org: once a day (after 9 AM IST) send `POST https://<your-service>.onrender.com/api/internal/reminders` with the header `x-cron-secret: <the CRON_SECRET value from Render>`. The reply shows how many reminders were created. The same call also wakes the sleeping server.

**Good to know**
- The first request after the server sleeps takes about 30 seconds (the free plan). Open the site once before a demo.
- Photos need Cloudinary, emails need Brevo, maps need Google keys; everything else works without them.
- The QR on invoices now opens your real Vercel address, so scanning with a phone works.

---

## Phase 9: Maps, distance and smart recommendation

### What's new
**Customer**
- **Find Centers** page (new menu item): a map of verified centers with numbered pins, **Use my location**, a radius (5, 10, 25, 50 km), each center's distance, **Road distance & time**, and **Open directions** (opens Google Maps). Tick *Also show other garages nearby* to list garages from Google Places that are not on SVMS
- **Book Service** now has **Use my location**. Results show a **Match %** score, "Best match", the distance, short reasons ("Close to you", "Lowest price"), a map, and a sort switch: *Best match / Nearest / Lowest price*

**Service center**
- **Profile & Brands → Location on the map**: **Use my current location** (stand at the workshop), **Find from my address** (Google Geocoding), a map preview and a link to check the pin on Google Maps

### How the recommendation score works (0 to 100)
| Part | Weight | How it is worked out |
|---|---|---|
| Distance | 35% | 0 km = full marks, 25 km or more = none (only when the customer shares a location) |
| Price | 25% | The cheapest center gets full marks; the others get cheapest ÷ their price |
| Availability | 15% | Free slots ÷ all slots on the chosen date |
| Rating | 15% | Customer reviews, smoothed (added in Phase 10; before that this part did not exist) |
| Experience | 10% | Jobs completed on SVMS, full marks at 50 |

Without a location the other weights are scaled up so the score still runs to 100. It is plain arithmetic: no AI, nothing hidden.

### Google keys (all optional)
Without keys the app still works: centers show a **straight-line** distance (haversine formula), the score still works, and road distance/time is a labelled **estimate**. Only the map picture, "Find from my address", real road times and the Places list need Google.
1. In https://console.cloud.google.com create a project, enable billing (Google gives a monthly free credit; keep your usage small) and enable: **Maps JavaScript API**, **Geocoding API**, **Routes API**, **Places API (New)**.
2. Create **two** API keys (Credentials → Create credentials):
   - **Browser key** → restrict to *Websites* (`http://localhost:5173/*` and later your Vercel address) and to *Maps JavaScript API*. Put in `frontend\.env`: `VITE_GOOGLE_MAPS_KEY=...`
   - **Server key** → restrict to *Geocoding*, *Routes* and *Places (New)*. Put in `backend\.env`: `GOOGLE_MAPS_SERVER_KEY=...` (never in the frontend)
3. Restart both windows. Set a **budget alert** in Google Cloud so a mistake can't cost money.

### Rules
| Rule | Why |
|---|---|
| The server key stays on the server; the browser key can only load the map and is limited to your websites | A key in the browser is public, so it is restricted |
| Route and Places calls are limited to 40 a minute per customer and cached for 10 minutes | Google bills per call |
| If Google fails or has no key, the customer gets a straight-line estimate instead of an error | Maps can never block a booking |
| The customer's location is sent only with the search, used for that one answer and **never stored** | Privacy |
| Only verified centers appear; a center's own location is shown only if the center set it | Same visibility rules as before |
| Latitude is checked to be -90..90 and longitude -180..180 on the server | No garbage coordinates |

### New API endpoints
| Who | Method | URL | Purpose |
|---|---|---|---|
| Customer | GET | `/api/maps/centers?lat=&lng=&radiusKm=` | Centers with a map location, nearest first |
| Customer | GET | `/api/maps/route?centerId=&lat=&lng=` | Road distance and time (Google, or estimate) |
| Customer | GET | `/api/maps/places?lat=&lng=&radiusKm=` | Other garages from Google Places |
| Customer | GET | `/api/maps/status` | Is Google set up? |
| Customer | GET | `/api/bookings/search?...&lat=&lng=` | Now adds `distanceKm`, `score`, `reasons` |
| Center | PUT | `/api/center/location` | `{ lat, lng }` |
| Center | POST | `/api/center/location/from-address` | Look up the saved address |
| Center | DELETE | `/api/center/location` | Remove the location |

### Upgrade from Phase 8
No new packages. Restart the backend and run `npm run seed` once: it gives both demo centers a map position in Mysuru (about 5 km apart). Optionally add the keys above.

### Test Phase 9
Use your browser's location permission (allow it). Demo centers are in Mysuru, so if you are elsewhere, distances will be large; in Chrome you can fake a location in DevTools → Sensors → Location (try 12.3200, 76.6300).

| # | Do this | Expected result |
|---|---|---|
| 1 | Customer → **Find Centers** (no location yet) | Both centers listed (map if the browser key is set), no distances |
| 2 | **Use my location** | Distances appear, nearest first; the radius picker appears |
| 3 | Radius **5 km** with your fake location near Vijayanagar | Only the centers within 5 km remain |
| 4 | **Road distance & time** on a center | "x km by road · about y min (estimate)"; with the server key it says "(with traffic)" |
| 5 | **Open directions** | Google Maps opens with the route filled in |
| 6 | Book Service → Creta, General Service, a date → **Use my location** → **Find centers** | Results show **Match %**, **Best match**, km away, reasons |
| 7 | Switch sort to **Nearest**, then **Lowest price** | The order changes; the numbers on the map pins follow the list |
| 8 | Search again **without** location | Match % still shows (distance part left out); **Nearest** is disabled |
| 9 | Center (`center@svms.local`) → Profile → **Remove** location | Customers no longer see a distance or pin for Kaveri |
| 10 | **Use my current location** (at the shop) | "Location saved"; the map preview shows the pin |
| 11 | **Find from my address** | With the server key: pin found from the address. Without: "needs Google Maps to be set up" |
| 12 | Customer → Find Centers → tick *Also show other garages nearby* | With keys: a grey-pin list with rating and Open now. Without: "Google Places is not set up" |
| 13 | Block location permission, then press **Use my location** | A clear message; searching still works |
| 14 | Open `/api/maps/centers` with no login | A 401 "not logged in" error |

### How to explain Phase 9 in the viva
- **Distance:** the haversine formula gives the straight-line distance between two latitude/longitude points on a sphere, with no external service. Google Routes adds the real road distance and live-traffic time.
- **Score:** a weighted sum of distance, price, availability and experience. Each part is scaled to 0..1, so it is transparent and each weight is a single constant that can be changed.
- **Graceful fallback:** every Google feature is optional. With no key, or when Google fails, the app falls back to an estimate instead of failing.
- **Cost and security:** the server key never reaches the browser, the browser key is restricted to our websites, calls are rate limited and cached.
- **Privacy:** the customer's location is requested by the browser (they must allow it), sent only for the search and never saved.

---

## Phase 8: Notifications, email, reminders and suggestions

### What's new
**Everyone (customer, service center, admin)**
- **Bell** in the top bar with an unread count. When something new arrives while you are online, a small pop-up appears (click it to open the page)
- **Notifications** page: newest first, unread highlighted, click one to open the related page, **Mark all as read**
- **Email switch**: "Email me important updates" (on by default)

**Customer gets notified when**
- a booking is confirmed or rejected, the vehicle is received, inspected, being worked on, in quality check, or **ready for pickup**
- the center recommends or changes repairs, the **bill is ready**, a payment is **confirmed or not accepted**, the vehicle is **handed over**

**Service center gets notified when**
- a **new booking** arrives, a booking is rescheduled or cancelled, the customer approves or rejects a repair, or a customer sends an **online payment to confirm**

**Daily reminders (customer)**
- **Documents** (insurance, PUC, RC): at 30, 7 and 1 days before, on the expiry day, and once after it has expired
- **Service due**: 6 months or 10,000 km after the last service, whichever comes first. A reminder at "due soon" (within 14 days or 500 km) and again when "overdue"
- Runs by itself once a day after 9 AM India time. `npm run reminders` runs it right now. Each reminder is sent only once

**Maintenance suggestions (customer)**
- On the dashboard and on each vehicle page: "Service is overdue / due soon" (with an estimate of when the km mark is reached, from your average km a day) and "Brakes: check at your next service" for any part that the latest inspection marked *Needs attention*, *Replace soon* or *Critical* and nobody has marked replaced since

### Email (Brevo) is optional
Email is sent only for the important events above and reminders. To turn it on:
1. Create a free account at https://www.brevo.com, add and verify a sender address, and create an API key (SMTP & API → API Keys).
2. Add to `backend\.env`:
   ```
   BREVO_API_KEY=your_key
   MAIL_FROM_EMAIL=the_sender_you_verified@example.com
   MAIL_FROM_NAME=Smart Vehicle Service
   ```
3. Restart the backend.

Without these, nothing is emailed and everything else works the same (the Notifications page says so). An email problem can never stop a booking, bill or payment.

### Rules
| Rule | Why |
|---|---|
| Notifications are loaded and changed only for the logged-in user (`user: req.user._id`) | Nobody can read or mark someone else's notifications |
| Reminders have a unique key (vehicle + document + expiry date + step; vehicle + last service + state) enforced by a unique index | Running the job twice, or restarting the server, never sends the same reminder twice |
| A new service or a new expiry date creates a new key | The next cycle gets its own reminders |
| Email is skipped if the user turned it off or no key is set; failures are only logged | Email can't break the app |
| Booking events become notifications through one listener in `realtime.js` | Phases 4 to 7 code did not have to change |

### New API endpoints
| Who | Method | URL | Purpose |
|---|---|---|---|
| Any logged-in user | GET | `/api/notifications?unread=true` | My notifications and the unread count |
| Any logged-in user | PATCH | `/api/notifications/:id/read` , `/read-all` | Mark read |
| Any logged-in user | GET / PUT | `/api/notifications/preferences` | `{ emailNotifications }` |
| Customer | GET | `/api/vehicles/suggestions` | Maintenance suggestions for my vehicles |

### Upgrade from Phase 7
Nothing to install (email uses Node's built-in `fetch`, so no new package). Restart the backend. The server log shows `Reminders YYYY-MM-DD: …` after the first daily run. Optional: add the Brevo values above.

### Test Phase 8
Window **A** = customer (`customer@svms.local`), window **B** (Incognito) = Kaveri (`center@svms.local`).

| # | Window | Do this | Expected result |
|---|---|---|---|
| 1 | A | Log in, look at the bell | No badge (or your old unread count) |
| 2 | A | **Book Service** for a date and slot | B's bell gets a badge and a pop-up "New booking request" without refreshing |
| 3 | B | **Accept** the booking | A's bell shows a pop-up "Booking confirmed"; the Notifications page lists it |
| 4 | A | Click the pop-up, or the bell → click the notification | Opens the booking and the notification turns read |
| 5 | A | Notifications → **Mark all as read** | Badge disappears |
| 6 | B | Move that job to *ready for pickup* (with a final bill) | A gets "Your bill is ready" and "Your vehicle is ready" |
| 7 | A | Pay online → **I have paid** | B gets "Online payment to confirm"; after B confirms, A gets "Payment confirmed" |
| 8 | — | In the backend folder run `npm run reminders` | "New reminders: …". The demo Creta's PUC (seeded to expire 10 days after you ran the seed) gives A a reminder "PUC certificate is expiring: KA09MB4821". If the seed was run long ago, set a PUC date within the next 30 days on the vehicle page first |
| 9 | — | Run `npm run reminders` again | "New reminders: 0 document, 0 service" (nothing repeated) |
| 10 | A | Dashboard / Creta page | **Maintenance suggestions** shows "Brakes: check at your next service" (from the demo inspection) |
| 11 | A | Change a vehicle's PUC date to 30+ days away, or tomorrow, and run `npm run reminders` | Date far away: nothing. Tomorrow: a "1 day" reminder |
| 12 | A | Notifications → untick **Email me important updates** | "Email updates are off." |
| 13 | A | (with Brevo set up) turn email on and have B accept a booking | An email "Booking confirmed" arrives with an **Open in SVMS** button |
| 14 | A | Open `/notifications` while logged out | Sent to the login page |

To see "Service overdue" quickly: finish the Activa job (Phase 6 handover) so it has a last service, then in MongoDB Atlas change `lastService.date` of that vehicle to a date 7 months ago and run `npm run reminders`.

### How to explain Phase 8 in the viva
- **Observer pattern:** every booking change already fires one realtime event. One listener turns each of those events into a stored notification, so the notification logic lives in one file and the earlier controllers were not changed.
- **Stored plus live:** a notification is saved in MongoDB (so it is there when you log in later) and pushed through a personal Socket.IO room (`user:<id>`) for instant pop-ups.
- **Idempotent reminders:** the daily job can run twice or after a restart. A unique index on (user, dedupeKey) makes duplicates impossible, so correctness does not depend on the timer.
- **Rules not magic:** service due = 6 months or 10,000 km after the last service. Suggestions use the latest health check and the km per day from the odometer history; nothing is guessed by AI.
- **Email as an optional service:** Brevo is called over HTTPS with a key from `.env`. If it is missing or fails, the app carries on, and users can switch email off.
- **India time:** "today" for reminders and expiry dates is calculated in Asia/Kolkata even on a UTC cloud server.

---

## Phase 7: Online payments and revenue

### What's new
**Service center**
- **Payments** page: turn on UPI, enter your UPI ID and the name customers see. Payments the customers say they made wait here: **Confirm received** (the bill becomes Paid) or **Reject** with a reason
- The same request also shows on the job card, under the bill
- **Revenue** page: paid invoices for a date range (7 / 30 / 90 days or your own dates): total, number of invoices, average bill, money billed but not yet paid, and splits by payment method and by service, plus a day-by-day table
- Handover no longer asks "Paid by" when the customer already paid online

**Customer**
- **Pay online (UPI)** on the booking page once the bill is final: a QR code, a button to open a UPI app, the UPI ID with a Copy button. After paying, type the 12-digit UPI reference (UTR) and tap **I have paid**; the center is told straight away and you are told when it is confirmed or rejected

**Admin**
- **Revenue** section on the dashboard: platform total for the range, by payment method and by service center

This is a **demo**: no real gateway is connected. The customer pays the center's UPI ID from their own app, and the center checks its account before confirming (like real UPI, there is no automatic callback).

### Rules the server enforces
| Rule | Why |
|---|---|
| The amount is taken from the bill, never from the browser | A customer can't pay or "pay" a different amount |
| One live payment per booking (partial unique index) | Double clicks and repeat submissions can't create two payments |
| One use of a UPI reference per center (partial unique index) | The same reference can't be used for two bills |
| Only a **submitted** payment can be confirmed, and only once (atomic update) | Double confirm does nothing twice |
| A payment is accepted only for a final, unpaid bill; a bill that is already paid cannot be paid again | No double payment |
| Handover is blocked while an online payment waits for confirmation | The center must decide first |
| A rejected payment can be sent again | The customer can fix a typo |
| Revenue counts only bills with `payment.status = paid`, grouped by India time | Unpaid or rejected money never counts |

### New API endpoints
| Who | Method | URL | Purpose |
|---|---|---|---|
| Center | GET / PUT | `/api/center/payment-settings` | `{ acceptsUpi, upiId, payeeName }` |
| Center | GET | `/api/center/payments?status=submitted` | Online payments to check |
| Center | PATCH | `/api/center/payments/:id/confirm` , `/reject` | Confirm, or reject `{ reason }` |
| Center | GET | `/api/center/revenue?from=&to=` | Revenue summary |
| Customer | GET | `/api/bookings/:id/pay` | UPI link and QR for the bill |
| Customer | POST | `/api/bookings/:id/payments` | `{ reference }`: "I have paid" |
| Admin | GET | `/api/admin/revenue?from=&to=` | Platform revenue, by center |

`POST /api/center/bookings/:id/handover` now takes `paymentMethod` only when the bill is not already paid online.

### Upgrade from Phase 6
Nothing to install (no new packages, no new `.env` values). Restart the backend, then run `npm run seed` once: it gives Kaveri the demo UPI ID `kaveri.motors@okaxis`.

### Test Phase 7
Window **A** = customer, window **B** (Incognito) = Kaveri. Use a job with a final bill (the demo Activa job: add parts, quality check, **Generate final bill**, **Mark ready for pickup**).

| # | Window | Do this | Expected result |
|---|---|---|---|
| 1 | B | **Payments** → tick *Accept UPI*, UPI ID `bad id` → Save | "Enter a valid UPI ID…" |
| 2 | B | UPI ID `kaveri.motors@okaxis` → Save | "Customers can now pay their bill by UPI." |
| 3 | A | Open the booking | **Pay online (UPI)** with QR, UPI ID and the exact bill amount |
| 4 | A | Reference `123` → **I have paid** | Refused: "Enter the 12-digit UPI reference number" |
| 5 | A | Reference `402815667301` → **I have paid** | "Payment sent…"; B sees the request without refreshing |
| 6 | A | Try sending again | The form is replaced by "Waiting for the service center" |
| 7 | B | Job card → try **Check code & hand over** | Refused: "Confirm or reject it before handing over" |
| 8 | B | **Reject…** with reason `Amount not received` | A sees the reason and can send again |
| 9 | A | Send reference `402815667302` | B sees a new request |
| 10 | B | **Confirm received** | Bill shows **Paid · UPI (online) · Ref 4028…**; A is updated live |
| 11 | B | Handover | No "Paid by" box; enter the pickup code → Completed |
| 12 | B | **Revenue** | The invoice is counted under UPI (online); "Billed, not paid yet" is lower by that amount |
| 13 | Admin | Dashboard → Revenue | Platform total includes it; Kaveri listed under By service center |
| 14 | A | Try another customer's booking URL, or pay a paid bill | "Booking not found" / "This bill is already paid" |

### How to explain Phase 7 in the viva
- **Why not a real gateway:** a gateway such as Razorpay needs a business account and webhooks. The demo follows the same life cycle (initiated → confirmed or failed) with the center acting as the "bank callback", and the UPI link/QR is the real UPI format.
- **Server decides the money:** the amount always comes from the stored bill, so the browser can't change it.
- **Database-enforced uniqueness:** partial unique indexes allow only one live payment per booking and one use of each reference per center, so races and double clicks can't cause double payment.
- **Atomic confirm:** `findOneAndUpdate` on `status: submitted` makes the confirmation happen exactly once; the bill is then marked paid only if it is still unpaid.
- **Revenue from the source of truth:** MongoDB aggregation over paid bills (`$match`, `$facet`, `$group`) in India time, so online and counter payments are both included and unpaid bills never count.

---

## Phase 6: Spare parts, bill, invoice and pickup

> Setting up for the first time? Follow **Step 1 to Step 4** further down using this zip, then come back here.

### What's new
**Service center**
- **Spare Parts** page (new menu item): every part with part no., HSN code, price before GST, GST rate, stock and a low-stock level. **Receive** adds new stock; **Edit** changes the price; low parts are marked in red and the dashboard warns about them
- **GSTIN** field on Profile & Brands (printed on invoices)
- Job card → **Parts & bill**:
  - while the service is in progress or in quality check, choose a part and quantity → **Add part**. It is taken out of stock straight away (and put back if you remove it)
  - a **live estimate** of the bill updates as you add parts: service charge + repairs the customer approved + parts, with CGST and SGST
  - in quality check → **Generate final bill**. It gets an invoice number like `KMW-2610-0001` and can't be changed after that
  - **Download invoice PDF** (with a QR code)
- **Mark ready for pickup** needs the final bill. It creates a **4-digit pickup code** for the customer
- **Hand over the vehicle**: type the customer's code, choose how they paid (cash, card or UPI at the counter) → the booking becomes **Completed**

**Customer**
- When the vehicle is ready, the booking page shows a big **pickup code** and the amount to pay. **Get a new code** replaces it
- **Bill** with every line, GST split and total, and **Download invoice PDF**
- After pickup: "Service completed", the bill shows **Paid**, and the vehicle page shows **Last service** (date and km)

**Anyone**
- Scanning the QR code on the PDF opens `/verify/<id>?code=…`, which says whether the invoice is genuine (no login needed)

### How the bill is worked out
| Line | Comes from | GST |
|---|---|---|
| Service | The price fixed when the customer booked (SAC 998714) | 18% |
| Repair parts + Repair labour | Only repairs the customer **approved** (rejected ones are never billed) | 18% |
| Parts | Each part added on the job card, qty × price | The part's own rate (0, 5, 12, 18 or 28%) |

GST is split equally into **CGST + SGST** (a local garage sells within the state). Everything is calculated in paise, then the total is rounded to the nearest rupee and the difference is shown as **Round off**.

Example (the demo Activa job): ₹950 service + 2 × ₹360 oil + ₹290 brake shoe = ₹1,960 taxable; 18% GST = ₹352.80 (CGST ₹176.40 + SGST ₹176.40); ₹2,312.80 → **₹2,313** (round off ₹0.20).

### Rules the server enforces
| Rule | Why |
|---|---|
| A part can be used only if enough is in stock; stock is reduced in one atomic step | Stock never goes below 0, even with two mechanics at once |
| Parts can be added only during "in progress" / "quality check", and not after the final bill | The bill matches the work done |
| Final bill only in quality check, only once; invoice numbers come from an atomic counter per center | No duplicate or changed invoices |
| "Ready for pickup" needs the final bill | The customer knows the amount before coming |
| Handover needs the right pickup code; after **5 wrong tries** it is locked until the customer gets a new code | Stops guessing; the right person collects the vehicle |
| The pickup code is sent only to the customer who owns the booking (never to the center, lists or live events) | The center can't hand over without the customer |
| The QR contains a code signed with the server's secret (HMAC-SHA256) | A fake or edited invoice won't verify |

### New API endpoints
| Who | Method | URL | Purpose |
|---|---|---|---|
| Center | GET / POST | `/api/center/parts` | List / add a part |
| Center | PATCH / DELETE | `/api/center/parts/:partId` | Edit (or `{ addStock }` to receive stock) / remove |
| Center | POST | `/api/center/bookings/:id/parts` | `{ partId, qty }`: use a part on the job |
| Center | DELETE | `/api/center/bookings/:id/parts/:lineId` | Remove it (back to stock) |
| Center | POST | `/api/center/bookings/:id/bill` | Make the bill final |
| Center | GET | `/api/center/bookings/:id/invoice.pdf` | Invoice PDF |
| Center | POST | `/api/center/bookings/:id/handover` | `{ otp, paymentMethod }` → Completed |
| Customer | GET | `/api/bookings/:id/invoice.pdf` | Invoice PDF |
| Customer | POST | `/api/bookings/:id/pickup-code` | New pickup code |
| Public | GET | `/api/meta/verify-invoice/:id?code=` | Is this invoice genuine? |

The job card (`GET /api/center/bookings/:id`) now also returns `billPreview` (the live estimate).

### Upgrade from Phase 5 (PowerShell)
Stop both windows (**Ctrl + C**). Unzip `svms-phase6.zip` to `C:\Projects\svms-p6`, then:
```powershell
Copy-Item C:\Projects\svms-p5\svms\backend\.env  C:\Projects\svms-p6\svms\backend\.env
Copy-Item C:\Projects\svms-p5\svms\frontend\.env C:\Projects\svms-p6\svms\frontend\.env

cd C:\Projects\svms-p6\svms\backend
npm install
npm run seed
npm run dev
```
Second window:
```powershell
cd C:\Projects\svms-p6\svms\frontend
npm install
npm run dev
```
`npm install` adds two new packages: **pdfkit** (makes the PDF) and **qrcode** (draws the QR). No new `.env` values.

`npm run seed` adds **8 spare parts** and a GSTIN to Kaveri, and a **demo job**: the customer's **Honda Activa 6G (KA 09 HK 1177)** at Kaveri, already in **Service in progress** with mechanic Imran Pasha. It's added even if you already have bookings.

### Test Phase 6
Window **A** = customer (`customer@svms.local` / `Customer@123`). Window **B** (Incognito) = **Kaveri** (`center@svms.local` / `Center@123`).

| # | Window | Do this | Expected result |
|---|---|---|---|
| 1 | B | Dashboard | "2 spare parts are low on stock" |
| 2 | B | **Workshop** → open the **Activa** job | "Parts & bill" shows a live estimate: Total so far **₹1,121.00** |
| 3 | B | Part **Scooter engine oil 10W-30**, Qty `2` → **Add part** | "Part added…"; total updates |
| 4 | B | Part **Front brake shoe (scooter)**, Qty `2` → **Add part** | Refused: "Only 1 Front brake shoe (scooter) left in stock" |
| 5 | B | Same part, Qty `1` → **Add part** | Total so far **₹2,313.00** |
| 6 | B | **Move to quality check** → **Mark ready for pickup** | Refused: "Generate the final bill before…" |
| 7 | B | **Generate final bill** | Invoice **KMW-YYMM-0001**, "Payment due at pickup"; A gets "Your bill is ready" |
| 8 | B | **Download invoice PDF** | PDF with GST lines, total and QR code |
| 9 | B | **Mark ready for pickup** | "Hand over the vehicle" box appears |
| 10 | A | **My Bookings** → "Open to see your pickup code and bill" | Big 4-digit code, amount ₹2,313, the bill |
| 11 | B | Type a **wrong** code → **Check code & hand over** | "That code is wrong. 4 tries left." |
| 12 | B | Type the **right** code, Paid by **UPI at the counter** → **Check code & hand over** | "Vehicle handed over. The job is complete." Bill shows **Paid** |
| 13 | A | (no refresh) | "Vehicle handed over. Thank you!"; all steps done incl. **Completed** |
| 14 | A | **My Vehicles** → Activa | "Last service: General Service on … at 21,480 km" |
| 15 | A | Under the bill → **Open the QR link** | New tab: "This invoice is genuine." with invoice no., total, Paid |
| 16 | B | **Spare Parts** → Wiper blade set → Qty `10` → **Receive** | Stock 12, no longer marked low |

**About the QR:** it holds the link `CLIENT_URL/verify/<booking id>?code=…`. On your PC that is `http://localhost:5173/…`, which a phone can't open, so for step 15 click **Open the QR link** under the bill instead (same link). After deployment (Phase 10) a phone scan works. Change one letter of the `code` in the address bar → "Invoice not found".

**The Phase 5 Creta job also works:** Approve brake pads → Start the work → Mark done → add 4 × Engine oil 5W-30 → quality check → Generate final bill. The rejected battery repair is **not** on the bill.

### How to explain Phase 6 in the viva
- **Inventory with atomic updates:** using a part runs one `findOneAndUpdate` with `stock >= qty` and `$inc: -qty`. The check and the decrease happen together inside the database, so two jobs can never take the last part twice.
- **Bill = data the customer already agreed to:** the booked price (snapshot at booking time), approved repairs and parts used. Rejected repairs are filtered out by status, so consent from Phase 5 flows into billing.
- **GST:** each line's tax = amount × rate, split into CGST and SGST. Money is held in paise (integers) to avoid floating-point errors like 0.1 + 0.2.
- **Invoice number:** an atomic `$inc` counter on the center gives sequential, never-repeated numbers.
- **PDF + QR:** the server draws the PDF with pdfkit. The QR holds a link with an **HMAC** of the invoice (using the server secret). The server compares the code in the link with the one it stored, so an invoice with a changed total or a made-up number fails.
- **Pickup code (OTP):** a random 4-digit code from `crypto.randomInt`, stored with `select: false` so it is never sent to the center. It is compared in constant time, and 5 wrong tries lock it. This proves the owner is present at handover.

---

## Phase 5: Work in the workshop

> Setting up for the first time? Follow **Step 1 to Step 4** further down using this zip, then come back here.

### What's new
**Service center**
- **Workshop** page: today's arrivals, vehicles in the workshop and vehicles ready for pickup, with the mechanic and any repairs waiting for the customer
- **Job card** for each booking:
  - progress bar and **one button for the next step**: Mark vehicle received → Start inspection → Start the work → Move to quality check → Mark ready for pickup
  - assign a **mechanic** (from Phase 3's list)
  - **Inspection & vehicle health**: condition of Engine, Brakes, Tyres, Battery and Engine oil (Good, Needs attention, Replace soon, Critical, Replaced, Changed), odometer reading and notes, with earlier health checks of the same vehicle
  - **Recommend a repair**: problem, reason, urgency, parts cost and labour cost. It goes to the customer for approval
  - **Mark done** only on repairs the customer **approved**
  - **Photo proof** (before / after / other) uploaded to Cloudinary
- Day schedule chips on the Bookings page open the job card

**Customer**
- **Booking details** page: progress bar, mechanic, health check, photos, timeline
- **Approve / Reject** each recommended repair, with its cost. A running total shows what you approved
- Everything updates **live**: status changes, new recommendations and photos appear without refreshing
- The dashboard warns when repairs are waiting for your decision
- Each vehicle page shows its **Health history**: every inspection side by side, oldest first, so you can see how each part changes over time

### Rules the server enforces
| Rule | Why |
|---|---|
| Status moves only **one step forward** in order | No skipped steps; every step is in the timeline |
| "Vehicle received" only on or after the booking date | Can't receive a car that hasn't arrived |
| "Start the work" needs a **mechanic** and a saved **inspection** | Every job has someone responsible and a health record |
| A repair can be marked done only if the customer **approved** it | No extra work without consent |
| "Quality check" is blocked while any repair is **waiting** for a decision or an approved repair isn't done | Nothing forgotten before handover |
| Once decided, a repair can't be changed or deleted | Clear record of what the customer agreed to |
| The odometer from inspection can't go below the vehicle's last reading; a higher reading updates the vehicle | Keeps the km history consistent |
| Customers can't cancel once the vehicle is in the workshop | Prevents confusion mid-service |
| Each center sees only its own jobs; customers only their own bookings and vehicles | Privacy |

"Completed" (with the bill, pickup code and payment) comes in **Phase 6**.

### New API endpoints
| Who | Method | URL | Purpose |
|---|---|---|---|
| Center | GET | `/api/center/jobs` | Arrivals today + vehicles in the workshop |
| Center | GET | `/api/center/bookings/:id` | Job card (booking + health + earlier health) |
| Center | PATCH | `/api/center/bookings/:id/mechanic` | `{ mechanicId }` |
| Center | PATCH | `/api/center/bookings/:id/status` | `{ status }`: the next step only |
| Center | PUT | `/api/center/bookings/:id/inspection` | `{ km, notes, items: { engine, brakes, tyres, battery, engineOil } }` |
| Center | POST / DELETE | `/api/center/bookings/:id/recommendations[/:recId]` | Recommend / remove (only while waiting) |
| Center | PATCH | `/api/center/bookings/:id/recommendations/:recId/done` | Mark an approved repair done |
| Center | POST / DELETE | `/api/center/bookings/:id/photos[/:photoId]` | Photo proof (form field `image`, plus `kind`, `caption`) |
| Customer | GET | `/api/bookings/:id` | Booking with health check |
| Customer | PATCH | `/api/bookings/:id/recommendations/:recId` | `{ decision: "approved" \| "rejected" }` |
| Customer | GET | `/api/vehicles/:id/health` | Health history of a vehicle |

### Upgrade from Phase 4 (PowerShell)
Stop both windows (**Ctrl + C**). Unzip `svms-phase5.zip` to `C:\Projects\svms-p5`, then:
```powershell
Copy-Item C:\Projects\svms-p4\svms\backend\.env  C:\Projects\svms-p5\svms\backend\.env
Copy-Item C:\Projects\svms-p4\svms\frontend\.env C:\Projects\svms-p5\svms\frontend\.env

cd C:\Projects\svms-p5\svms\backend
npm install
npm run seed
npm run dev
```
Second window:
```powershell
cd C:\Projects\svms-p5\svms\frontend
npm install
npm run dev
```
`npm run seed` adds a **ready-made demo job**: the demo customer's Hyundai Creta (KA 09 MB 4821) at **Kaveri Motor Works**, already inspected, with **2 repairs waiting for approval**, plus an older health check.
It's only added if the demo customer has **no bookings yet**. If you already made bookings with `customer@svms.local`, you won't get it. Use the "fresh booking" test below instead.

Photos need the Cloudinary keys from Phase 2. Everything else works without them.

### Test Phase 5
Window **A** = customer (`customer@svms.local` / `Customer@123`). Window **B** (Incognito) = **Kaveri** (`center@svms.local` / `Center@123`).

**Using the demo job**
| # | Window | Do this | Expected result |
|---|---|---|---|
| 1 | A | Dashboard | Yellow box: "Kaveri Motor Works recommends extra repairs…" → **Review repairs** |
| 2 | A | Booking details | Progress at **Inspection**; 2 repairs with **Approve / Reject**; health check shows Brakes "Needs attention" |
| 3 | B | **Workshop** | The Creta under "In the workshop" with "2 repairs waiting for customer" → open it |
| 4 | B | Add a repair: `Wiper blades torn`, `Streaks on windscreen`, Low, ₹450, ₹0 → **Send to customer** | Window A shows "recommended extra work" and a 3rd repair, without refreshing |
| 5 | B | **Start the work** | A's progress moves to "Service in progress" by itself |
| 6 | B | **Move to quality check** | Refused: "…still waiting for the customer's decision" |
| 7 | A | **Approve** brake pads, **Reject** battery and wipers | "You approved: ₹3,100"; B shows "The customer approved / rejected a repair" |
| 8 | B | Move to quality check again | Refused: "Mark the 1 approved repair as done first" |
| 9 | B | **Mark done** on brake pads; Brakes → **Replaced**, odometer `18520` → **Update inspection** | Saved |
| 10 | B | Move to quality check → **Mark ready for pickup** | A shows "Your vehicle is ready" |
| 11 | A | "See this vehicle's full health history" | Two inspections side by side (older and today); Brakes went from Needs attention to Replaced; odometer now 18,520 km |
| 12 | B | Upload a photo with type Before (needs Cloudinary) | A sees it under "Photos from the workshop" |

**With a fresh booking (works any time)**
1. A: **Book Service** → Activa → General Service at Kaveri for **today** (or any date) → Confirm.
2. B: **Bookings** → Accept. On the booking date, it appears under **Workshop → Arriving**.
3. B: open the job card → assign a mechanic → **Mark vehicle received** → **Start inspection** → fill the health check → **Save inspection** → recommend a repair → continue as above.
4. Try **Start the work** before saving the inspection or before choosing a mechanic. It's refused with the reason.

### How to explain Phase 5 in the viva
- **State machine:** a booking moves through fixed steps (received → inspection → in progress → quality check → ready). The server allows only the next step and checks the conditions for it, so the UI can't push a job into an impossible state.
- **Customer consent:** extra repairs are separate records with a status (waiting / approved / rejected). Only approved ones can be marked done, and quality check is blocked until every decision is made.
- **Health history:** each inspection is its own `VehicleHealth` document linked to the vehicle and booking. Showing them side by side shows how the vehicle's condition changes over time. Phase 8 uses this history for maintenance suggestions.
- **Real-time:** every change on the job card pushes a Socket.IO event to the customer, and every customer decision pushes one to the center.
- **Cloud storage:** photo proof goes to Cloudinary; MongoDB keeps only the link.

---

## Phase 4: Booking

> Setting up for the first time? Follow **Step 1 to Step 4** further down using this zip, then come back here.

### What's new
**Customer**
- **Book Service**: choose vehicle, service and date (and optionally a city). Only centers that are **verified**, service the vehicle's **brand**, and offer that **service** for that vehicle type are shown, with price, time and every slot's free places
- Pick a slot, add a note for the mechanic, **Confirm booking**
- **Live availability**: if another customer takes a slot while you are looking, it turns "Full" immediately. If it was the slot you picked, you are told to choose another
- **My Bookings**: upcoming and past tabs, **Reschedule** (choose a new date and slot), **Cancel** (with optional reason). Confirmations and rejections from the center appear instantly
- "Book service" button on each vehicle page; the dashboard shows the next booking

**Service center**
- **Bookings** page: requests appear **instantly** (no refresh). **Accept**, or **Reject** with a reason for the customer
- **Day schedule**: every slot of a chosen day with places used (e.g. 1/2) and the vehicles booked
- Dashboard shows today's bookings, requests waiting and upcoming confirmed bookings

**Admin**
- **Bookings** page with all bookings and a status filter; dashboard shows booking counts

**Rules the server enforces**
- Slot must exist (not lunch break, not a holiday or closed day), not already started, and within the center's booking window (default 30 days)
- One vehicle can't have two active bookings on the same day
- Rescheduling takes the new place **first**, then frees the old one, so you never lose your booking if the new slot fills up
- Cancel, reject and reschedule all give the place back immediately
- Customers see and change only their own bookings; centers see only theirs
- Booking attempts are rate-limited (20 per minute per customer)

### How double booking is prevented (important for the viva)
Each place in a slot is a **seat** record (`SlotSeat`). A slot with capacity 2 has seat 0 and seat 1.
The database has a **unique index** on *(center, date, slot, seat)*, so the database itself refuses a second record for the same seat.

When a customer books, the server tries to insert seat 0. If it is already taken (MongoDB error 11000), it tries seat 1, and so on.
If every seat is taken, the customer gets "someone just booked the last place". Two requests at the same instant can't both win, because only one insert of the same seat can ever succeed.

Tested here: **20 customers booking the same 1-place slot at the same moment, 10 rounds → always exactly 1 booking**.
The server also builds this index at startup and refuses to start if it can't, so the protection is never missing.

### How live updates work
The backend runs **Socket.IO** on the same port as the API.
- The booking page joins a "room" for each center and date shown. When a seat is taken or freed, the server tells that room, and the page reloads just that center's slots
- A logged-in center joins its own room and is told about new, cancelled and rescheduled bookings
- A logged-in customer joins their own room and is told when a booking is accepted or rejected

### New API endpoints
| Who | Method | URL | Purpose |
|---|---|---|---|
| Customer | GET | `/api/bookings/search?vehicleId=&serviceKey=&date=&city=` | Matching centers with price and slots |
| Customer | GET | `/api/bookings/availability/:centerId?date=` | Slots and free places |
| Customer | POST | `/api/bookings` | Book `{ vehicleId, centerId, serviceKey, date, slot, problem }` |
| Customer | GET | `/api/bookings` , `/api/bookings/:id` | My bookings |
| Customer | PATCH | `/api/bookings/:id/reschedule` | `{ date, slot }` |
| Customer | PATCH | `/api/bookings/:id/cancel` | `{ reason }` |
| Center | GET | `/api/center/bookings?status=&date=` | My center's bookings |
| Center | GET | `/api/center/schedule?date=` | Day view with places used |
| Center | GET | `/api/center/booking-stats` | Dashboard numbers |
| Center | PATCH | `/api/center/bookings/:id/accept` , `/reject` | Accept, or reject `{ reason }` |
| Admin | GET | `/api/admin/bookings?status=` | All bookings |

### Upgrade from Phase 3 (PowerShell)
Stop both windows (**Ctrl + C**). Unzip `svms-phase4.zip` to `C:\Projects\svms-p4`, then:
```powershell
Copy-Item C:\Projects\svms-p3\svms\backend\.env  C:\Projects\svms-p4\svms\backend\.env
Copy-Item C:\Projects\svms-p3\svms\frontend\.env C:\Projects\svms-p4\svms\frontend\.env

cd C:\Projects\svms-p4\svms\backend
npm install
npm run seed
npm run dev
```
The backend should print `API running on http://localhost:5000 (live updates on)`.

Second window:
```powershell
cd C:\Projects\svms-p4\svms\frontend
npm install
npm run dev
```
`npm run seed` adds a **second center**: `center2@svms.local` / `Center@123` (Vijayanagar Auto Hub, 1 vehicle per slot, open Sundays).

Optional in `backend\.env`: `AUTH_RATE_LIMIT=20` (login attempts per 15 minutes). Raise it while testing if you log in and out a lot.

### Test Phase 4
Use **two browser windows side by side**: a normal window and an **Incognito / InPrivate** window (so you can be logged in as two people).

| # | Window | Do this | Expected result |
|---|---|---|---|
| 1 | A | Log in as `customer@svms.local` → **Book Service** → Creta, General Service, next Monday → Find centers | 2 centers; Vijayanagar (₹3,900) first, Kaveri (₹4,200) second, with slots |
| 2 | A | Choose Activa instead | Only Kaveri (only it services Honda bikes) |
| 3 | B | Log in as `center2@svms.local` → **Bookings** | "No requests waiting" |
| 4 | A | Creta → pick 10:00 AM at Vijayanagar → Confirm booking | Goes to My Bookings: "Waiting for center" |
| 5 | B | (don't refresh) | The request appears by itself with a "New booking" message |
| 6 | B | Click **Accept** | A shows "confirmed by the center" without refreshing |
| 7 | A | Book Service again for the same Creta on the same day | "This vehicle already has booking … on that date" |
| 8 | A | Search Vijayanagar for that Monday | 10:00 AM shows **Full** (capacity 1) |
| 9 | A | My Bookings → **Reschedule** → 3:00 PM → Move booking | Back to "Waiting for center"; B is told it was rescheduled |
| 10 | B | Day schedule for that Monday | 3:00 PM shows 1/1 used, 10:00 AM is free again |
| 11 | A | **Cancel booking** | Cancelled; it moves to the Past tab; the slot is free again |
| 12 | A | Book an Activa slot at Kaveri. In a Kaveri window (`center@svms.local`), click **Reject…** with no reason, then with a reason | First: error asking for a reason. Then: rejected, and the customer sees the reason |
| 13 | A | Try a Sunday at Kaveri | Kaveri shows "Closed on this day of the week" |
| 14 | A | Open the search, pick a slot, and in window B book that same slot as another customer | Window A shows "was just booked by someone else" and the slot turns Full |
| 15 | Admin | Log in as admin → **Bookings** | All bookings with status filter; dashboard shows counts |

### How to explain Phase 4 in the viva
- **Double-booking prevention:** a unique index on (center, date, slot, seat). The database, not the browser, decides who gets the last seat. Checking "is there space?" and then saving would leave a gap where two requests both see space; inserting a unique seat closes that gap.
- **Cleanup on failure:** if saving the booking fails after a seat is taken, the seat is deleted again, so no place is lost.
- **Reschedule order:** take the new seat, save the booking, then free the old seat.
- **Snapshots:** the booking keeps a copy of the service price and vehicle details from the moment of booking, so later price changes don't alter existing bookings.
- **Real-time (Socket.IO):** WebSocket rooms per center and date. The server pushes "slots changed" and "booking changed" events, and pages update without refresh.
- **Time zone:** all slot times use India time (Asia/Kolkata), even when the cloud server runs in UTC.

---

## Phase 3: Service center setup

> Setting up for the first time? Follow **Step 1 to Step 4** further down using this zip, then come back here.

### What's new
**Backend**
- `ServiceCenter` now stores: description, **brands** it services (car and bike lists), **services with starting price and time needed**, **working hours** for each day with an optional lunch break, **slot settings** (one-hour slots, vehicles per slot, how many days ahead customers can book) and **holidays**
- A fixed list of 11 standard services (`src/constants/services.js`), so every center uses the same names and Phase 4 search works reliably. AC Service is car-only; Chain & Sprocket is bike-only
- New `Mechanic` model (name, mobile, skills, experience, active/inactive). Mechanics don't log in
- Slot generator (`src/utils/slots.js`) turns working hours into bookable one-hour slots, skips the lunch break, closes holidays and closed days. Phase 4 builds booking on top of it
- A **setup checklist** (brands, services, hours) is calculated for every center. The admin list shows whether each center's setup is complete
- Rules the server enforces:
  - brands must come from the official list
  - you can't add a car service with no car brands, or remove every bike brand while a bike service is still offered
  - you can't add the same service twice for the same vehicle type
  - closing time must be at least 1 hour after opening, and the break must sit inside working hours
  - holidays can't be in the past or added twice
  - a center can only see and change **its own** profile and mechanics
- `npm run seed` gives the demo center brands, 6 services and 3 mechanics. It also fills in a demo center created by an earlier phase

**Frontend (service center menu)**
- **Dashboard**: verification status, brand/service/slot/mechanic counts and a setup checklist with links
- **Profile & Brands**: edit details and tick the car and bike brands you service
- **Services & Prices**: add a service from the standard list, set price and time, edit, pause/offer, delete
- **Hours & Slots**: hours for each day (with "Copy Monday to Tue–Sat"), vehicles per slot, booking window, holidays, and a **slot preview** for any date
- **Mechanics**: add, edit, mark inactive, and show inactive mechanics

### New API endpoints (service center login required)
| Method | URL | Purpose |
|---|---|---|
| GET | `/api/meta/service-catalog` | Standard services and day names (public) |
| GET / PATCH | `/api/center/profile` | View / edit center details |
| PUT | `/api/center/brands` | `{ Car: [...], Bike: [...] }` |
| POST | `/api/center/services` | Add `{ key, vehicleType, price, durationMins, notes }` |
| PATCH / DELETE | `/api/center/services/:serviceId` | Edit price/time/active, or remove |
| PUT | `/api/center/hours` | All 7 days of working hours |
| PUT | `/api/center/slot-settings` | `{ capacityPerSlot, bookingWindowDays }` |
| POST / DELETE | `/api/center/holidays` , `/api/center/holidays/:date` | Add / remove a holiday |
| GET | `/api/center/slots/preview?date=YYYY-MM-DD` | Slots for a date |
| GET / POST | `/api/center/mechanics` | List (`?all=true` includes inactive) / add |
| PATCH | `/api/center/mechanics/:mechanicId` | Edit or mark inactive |

### Upgrade from Phase 2 (PowerShell)
Stop both running windows (**Ctrl + C**). Unzip `svms-phase3.zip` to `C:\Projects\svms-p3`, then:
```powershell
Copy-Item C:\Projects\svms-p2\svms\backend\.env  C:\Projects\svms-p3\svms\backend\.env
Copy-Item C:\Projects\svms-p2\svms\frontend\.env C:\Projects\svms-p3\svms\frontend\.env

cd C:\Projects\svms-p3\svms\backend
npm install
npm run seed
npm run dev
```
Second window:
```powershell
cd C:\Projects\svms-p3\svms\frontend
npm install
npm run dev
```
Open http://localhost:5173. No new accounts or keys are needed for this phase.

### Test Phase 3
Log in as **center@svms.local** / **Center@123**.

| # | Test | Expected result |
|---|---|---|
| 1 | Dashboard | "Ready for bookings", 5 brands, 6 services, 3 mechanics |
| 2 | Profile & Brands → tick **Kia** → Save brands | "Brands saved." |
| 3 | Bike brands → **Clear** → Save brands | Error: you still offer General Service for bikes |
| 4 | Services & Prices → add **Wheel Alignment & Balancing** for Car at ₹700 | Appears in the Car table |
| 5 | Try adding the same service again | It's no longer in the dropdown (and the server would refuse it) |
| 6 | Edit Oil Change price to ₹2,600 | Table shows ₹2,600 |
| 7 | **Pause** the bike General Service, then clear bike brands again | Now it saves |
| 8 | Hours & Slots → slot preview for next Monday | 8 slots, with no 13:00 slot (lunch) |
| 9 | Preview a Sunday | "Closed on this day of the week" |
| 10 | Set Monday closing time to 08:00 → Save | "Monday: Closing time must be at least one hour after opening" |
| 11 | Saturday 09:00–13:00 with no break → Save → preview Saturday | 4 slots |
| 12 | Vehicles per slot = 3 → Save | Preview shows "3 vehicles" on each slot |
| 13 | Add a holiday for a date → preview that date | "Holiday: … No slots." |
| 14 | Mechanics → add one → Mark inactive → tick Show inactive | Hidden, then visible again |
| 15 | Register a **new** service center | Dashboard says "Not ready for bookings yet"; Services page asks for brands first |
| 16 | Log in as admin | The new center shows **Incomplete** in the Setup column |
| 17 | As a customer, open http://localhost:5173/center/profile | Sent back to the customer dashboard |

### How to explain Phase 3 in the viva
- **Standard service list:** centers pick services from a fixed list instead of typing names, so customer search in Phase 4 always matches.
- **Slot generation:** slots are not stored in the database. They are calculated from working hours, the break and holidays whenever needed, so changing hours updates every future date at once.
- **Capacity:** "vehicles per slot" is how many vehicles the center can take in one hour. Phase 4 stops bookings when a slot is full, using one atomic database update.
- **Data rules on the server:** brands from the official list, no services for a vehicle type without brands, valid hours and breaks, no past holidays. The React form helps, but the API is what enforces them.
- **Separation of data:** each center can only reach its own profile and mechanics. Every query uses the logged-in owner's ID.
- **Mechanics without logins:** this matches the project scope and keeps security simple. The center assigns them to jobs in Phase 5.

---

## Phase 2: Vehicles

> Setting up for the first time? Follow **Step 1 to Step 4** further down using this zip instead of the Phase 1 zip, then come back here.

### What's new
**Backend**
- `Vehicle` model: type, brand, model, variant, year, registration number, fuel, current km, odometer history, insurance/PUC/RC expiry dates, photo
- Registration numbers are cleaned up (`ka 09 mb-4821` → `KA09MB4821`) and checked against the Indian formats, including the BH series (`22BH1234AB`)
- One registration number can belong to only one active vehicle on the whole platform (unique index plus a friendly 409 message)
- Brand must match the type (you can't save a Hero car). The brand list lives in `src/constants/vehicles.js` and Phase 3 reuses it for service centers
- Odometer readings can only go up, and huge jumps (over 100,000 km) are rejected. One reading per day is kept
- Photo upload to **Cloudinary** with Multer (memory only, max 2 MB, JPG/PNG/WebP). Replacing a photo deletes the old one from Cloudinary
- Customers can only see or change **their own** vehicles. Someone else's vehicle ID returns "not found"
- "Remove" archives the vehicle instead of deleting it, so later bills and service history keep working
- Admin stats now count cars and bikes
- `npm run seed` adds two demo vehicles to the demo customer
- Service center sign-up no longer needs MongoDB transactions, so it also works on a local MongoDB

**Frontend**
- Top menu: Dashboard, My Vehicles
- My Vehicles: cards with photo, number plate, km and document status
- Add / Edit vehicle form. The brand list changes with Car or Bike
- Vehicle page: photo upload, document dates with status (valid / expires in N days / expired), odometer update with history and average km per day, remove with a confirmation step
- Dashboard warns about documents that are expired or expire within 30 days

### New API endpoints (customer login required)
| Method | URL | Purpose |
|---|---|---|
| GET | `/api/meta/vehicle-options` | Types, brands, fuels (public) |
| GET | `/api/vehicles` | My vehicles |
| POST | `/api/vehicles` | Add a vehicle |
| GET | `/api/vehicles/:id` | One vehicle |
| PATCH | `/api/vehicles/:id` | Edit details |
| DELETE | `/api/vehicles/:id` | Remove (archive) |
| POST | `/api/vehicles/:id/odometer` | Add a reading `{ km }` |
| PUT | `/api/vehicles/:id/documents` | Set expiry dates |
| POST | `/api/vehicles/:id/image` | Upload photo (form field `image`) |
| DELETE | `/api/vehicles/:id/image` | Remove photo |

### Upgrade from Phase 1 (PowerShell)
Unzip `svms-phase2.zip` to a new folder, for example `C:\Projects\svms-p2`, then copy your two `.env` files across:
```powershell
Copy-Item C:\Projects\svms\backend\.env  C:\Projects\svms-p2\svms\backend\.env
Copy-Item C:\Projects\svms\frontend\.env C:\Projects\svms-p2\svms\frontend\.env

cd C:\Projects\svms-p2\svms\backend
npm install
npm run seed
npm run dev
```
In a second window:
```powershell
cd C:\Projects\svms-p2\svms\frontend
npm install
npm run dev
```
(If you use Git, you can instead copy the new files over your Phase 1 folder and commit.)

### Set up Cloudinary for vehicle photos (free)
1. Sign up at https://cloudinary.com (free plan).
2. Dashboard → **Settings → API Keys**. Copy the *Cloud name*, *API key* and *API secret*.
3. Add them to `backend\.env`:
   ```
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=123456789012345
   CLOUDINARY_API_SECRET=your_secret
   ```
4. Restart the backend (`Ctrl+C`, then `npm run dev`).

Without these keys everything works except photo upload, which shows "Photo upload is not set up yet".
The API secret stays on the server. The browser sends the photo to your backend, and the backend uploads it to Cloudinary.

### Test Phase 2
| # | Test | Expected result |
|---|---|---|
| 1 | Log in as `customer@svms.local` | Dashboard shows the Creta and Activa, and a warning that the Creta's PUC expires soon |
| 2 | My Vehicles → Add vehicle, choose **Bike** | Brand list changes to bike brands |
| 3 | Add a Tata Nexon with reg `ka01ab1234` | Opens the vehicle page showing **KA 01 AB 1234** |
| 4 | Add another vehicle with reg `KA09MB4821` | "already registered on the platform" |
| 5 | Enter reg `HELLO` or year `1980` | Clear error, nothing saved |
| 6 | On the vehicle page, enter a lower km than now | "can't be lower than the current … km" |
| 7 | Enter a higher km | Saved and shown in the history |
| 8 | Set a PUC date 10 days from today | Chip shows "Expires in 10 days"; the dashboard shows a warning |
| 9 | Upload a photo (after setting up Cloudinary) | Photo appears; it is also visible in Cloudinary → Media Library |
| 10 | Upload a PDF or a 5 MB photo | "Upload a JPG, PNG or WebP image" / "smaller than 2 MB" |
| 11 | Remove a vehicle | It disappears from the list; you can add the same reg again |
| 12 | Register a second customer and open the first customer's vehicle URL | "Vehicle not found" |
| 13 | Log in as admin | Vehicles stat shows cars and bikes |

### How to explain Phase 2 in the viva
- **Cloud storage:** photos go to Cloudinary, a cloud media service. MongoDB stores only the image URL and ID, not the image itself.
- **Ownership check:** every vehicle query includes `owner: req.user._id`, so a customer can never read or change someone else's vehicle, even by guessing an ID.
- **Data quality:** registration numbers are normalised and validated, brand must match the type, and the odometer can't go backwards.
- **Soft delete:** removing a vehicle sets `isActive: false`, so later bills and service history still point to a real vehicle. A partial unique index allows the same registration to be added again once archived.
- **Why odometer history:** Phase 8 uses it to estimate km per day and to remind the customer at 6 months or 10,000 km, whichever comes first.

---

## Phase 1: what's included

**Backend (`backend/`)**
- Express API with Helmet, CORS, JSON size limit and rate limiting on login and register
- MongoDB Atlas connection using Mongoose
- `User` model with bcrypt password hashing and roles `customer`, `service_center`, `admin`
- `ServiceCenter` model with verification status
- JWT login, `protect` middleware (must be logged in) and `authorize(role)` middleware (correct role required)
- Input validation with express-validator
- Admin APIs: stats, customer list, center list, verify/reject/suspend a center
- `npm run seed` creates the admin and two demo accounts

**Frontend (`frontend/`)**
- React (Vite) with React Router and Axios
- Login and Register pages. Register lets you choose "I own a vehicle" or "I run a service center"
- Separate dashboards for each role. Opening another role's page redirects you to your own
- You stay logged in after a page refresh (the token is checked through `/api/auth/me`)
- Admin dashboard lists centers with Verify / Reject / Suspend buttons

### Folder structure
```
svms/
├── backend/
│   ├── scripts/seed.js
│   ├── src/
│   │   ├── app.js            Express app (middleware + routes)
│   │   ├── server.js         Starts the server after connecting to MongoDB
│   │   ├── config/db.js
│   │   ├── controllers/      authController.js, adminController.js
│   │   ├── middleware/       auth.js, validate.js, errorHandler.js
│   │   ├── models/           User.js, ServiceCenter.js
│   │   ├── routes/           authRoutes.js, adminRoutes.js
│   │   └── utils/AppError.js
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/client.js     Axios with the JWT attached
    │   ├── context/AuthContext.jsx
    │   ├── components/       Layout.jsx, ProtectedRoute.jsx
    │   ├── pages/            Login, Register, Customer/Center/Admin dashboards
    │   ├── App.jsx, main.jsx, styles.css
    ├── .env.example
    └── package.json
```

---

## Step 1: install the tools (one time)

1. **Node.js 20 or 22 LTS** from https://nodejs.org (choose the LTS installer).
2. **VS Code** from https://code.visualstudio.com
3. **Git** from https://git-scm.com

Check in PowerShell:
```powershell
node -v
npm -v
git --version
```

## Step 2: create the MongoDB Atlas database (free)

1. Go to https://www.mongodb.com/cloud/atlas and sign up.
2. Create a **free (M0) cluster**. Choose the AWS **Mumbai (ap-south-1)** region.
3. **Database Access** → Add New Database User → username + password (avoid `@` `:` `/` in the password) → role *Read and write to any database*.
4. **Network Access** → Add IP Address → **Add Current IP Address**. (For Render later you will add `0.0.0.0/0`.)
5. **Database** → Connect → **Drivers** → copy the connection string. It looks like:
   `mongodb+srv://myuser:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority`
6. Put your password in place of `<password>`, and add the database name `svms` after `.net/`:
   `mongodb+srv://myuser:MyPass123@cluster0.abcde.mongodb.net/svms?retryWrites=true&w=majority`

## Step 3: unzip and set up the backend

Unzip `svms-phase1.zip` to, for example, `C:\Projects\svms`. Then in PowerShell:

```powershell
cd C:\Projects\svms\backend
npm install
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Open `backend\.env` in VS Code and set:
- `MONGO_URI` = the connection string from Step 2
- `JWT_SECRET` = the long random value printed by the last command
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` = your admin login

Create the admin and demo accounts, then start the API:
```powershell
npm run seed
npm run dev
```
You should see `MongoDB connected` and `API running on http://localhost:5000`.
Check http://localhost:5000/api/health in the browser. It should show `{"status":"ok", ...}`.

Leave this window open.

## Step 4: set up the frontend

Open a **second** PowerShell window:
```powershell
cd C:\Projects\svms\frontend
npm install
Copy-Item .env.example .env
npm run dev
```
Open http://localhost:5173

## Step 5: test Phase 1

| # | Test | Expected result |
|---|---|---|
| 1 | Log in as `customer@svms.local` / `Customer@123` | Customer dashboard |
| 2 | Refresh the page | Still logged in |
| 3 | While logged in as the customer, type `http://localhost:5173/admin` in the address bar | Sent back to the customer dashboard |
| 4 | Log out, then register a new **service center** | Center dashboard shows "Waiting for admin verification" |
| 5 | Log in as admin (your `ADMIN_EMAIL`) | The new center is in the **Pending** list |
| 6 | Click **Verify**, then log in as that center again | Status shows "Verified" |
| 7 | Register with a short password or a 5-digit PIN code | A clear error message, no account created |
| 8 | Log in with a wrong password 21 times | "Too many attempts…" (rate limiting) |
| 9 | In MongoDB Atlas → Browse Collections → `users` | Passwords are stored as bcrypt hashes, never as plain text |

## Common problems

| Error | Fix |
|---|---|
| `Could not connect to MongoDB` / `querySrv ENOTFOUND` | Check `MONGO_URI`. Make sure your current IP is in Atlas → Network Access. Some college Wi-Fi blocks MongoDB; try a mobile hotspot. |
| `bad auth : authentication failed` | Wrong database username or password in `MONGO_URI` (use the Database Access user, not your Atlas login). |
| `JWT_SECRET is not set` | Put a long random value in `backend\.env`. |
| Frontend says "Cannot reach the server" | The backend window must be running `npm run dev` on port 5000. |
| `npm` is not recognised | Reinstall Node.js and reopen PowerShell. |
| PowerShell: "running scripts is disabled" | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, then try again. |

## Save your work to GitHub

```powershell
cd C:\Projects\svms
git init
git add .
git commit -m "Phase 1: setup, authentication and roles"
```
Then create an empty repository on GitHub and run the two `git remote add` / `git push` commands GitHub shows you. `.env` files are listed in `.gitignore`, so your secrets are not uploaded.

## How to explain Phase 1 in the viva

- **Cloud database:** all data is stored in MongoDB Atlas, a managed cloud database, not on the laptop.
- **Authentication:** passwords are hashed with bcrypt (12 rounds). Login returns a signed JWT that the browser sends with every request.
- **Authorization:** the `protect` middleware checks the token, and `authorize('admin')` checks the role on the server. Hiding a button in React is not security; the API refuses the request on its own.
- **Validation:** every input is checked on the server, for example the 6-digit PIN code and the 10-digit mobile number.
- **Admin cannot be self-registered:** the register API accepts only customer or service center. The admin is created by the seed script.
- **Atomic sign-up:** a service center's user account and its profile are created in one MongoDB transaction, so you never get half an account.
