import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../../components/Layout.jsx';
import Plate from '../../components/Plate.jsx';
import VehicleThumb, { vehiclePhoto } from '../../components/VehicleThumb.jsx';
import StatusSteps from '../../components/StatusSteps.jsx';
import Notice from '../../components/Notice.jsx';
import PhotoGrid from '../../components/PhotoGrid.jsx';
import { HealthGrid, HealthHistory } from '../../components/HealthView.jsx';
import BillTable from '../../components/BillTable.jsx';
import api, { errorMessage, downloadFile } from '../../api/client.js';
import { prepareUpload } from '../../utils/shrinkImage.js';
import { getSocket } from '../../api/socket.js';
import PaymentRequests from '../../components/PaymentRequests.jsx';
import {
  statusLabel, statusTone, inr, niceDate, niceTime, NEXT_STEP,
  HEALTH_PARTS, HEALTH_VALUES, URGENCY_TONE, REC_STATUS, PAY_METHODS
} from '../../utils/booking.js';

const blankRec = { problem: '', reason: '', urgency: 'Medium', partsCost: '', labourCost: '' };

export default function JobCard() {
  const { id } = useParams();
  const [job, setJob] = useState(null);       // { booking, health, previous }
  const [mechanics, setMechanics] = useState([]);
  const [error, setError] = useState('');
  const [msgs, setMsgs] = useState({});
  const [insp, setInsp] = useState(null);
  const [rec, setRec] = useState(blankRec);
  const [photo, setPhoto] = useState({ kind: 'before', caption: '' });
  const [uploading, setUploading] = useState(false);
  const [parts, setParts] = useState([]);
  const [use, setUse] = useState({ partId: '', qty: 1 });
  const [hand, setHand] = useState({ otp: '', paymentMethod: 'cash' });
  const say = (k, tone, text) => setMsgs((m) => ({ ...m, [k]: text ? { tone, text } : null }));

  const apply = useCallback((data) => {
    setJob(data);
    const h = data.health;
    setInsp({
      km: h?.km ?? data.booking.vehicle?.km ?? '',
      notes: h?.notes ?? '',
      items: Object.fromEntries(HEALTH_PARTS.map(([k]) => [k, h?.items?.[k] || 'good']))
    });
  }, []);

  const load = useCallback(() => {
    api.get(`/center/bookings/${id}`).then(({ data }) => apply(data)).catch((e) => setError(errorMessage(e)));
  }, [id, apply]);

  const loadParts = useCallback(() => {
    api.get('/center/parts').then(({ data }) => setParts(data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadParts();
    api.get('/center/mechanics').then(({ data }) => setMechanics(data)).catch(() => {});
  }, [load, loadParts]);

  // Live: the customer approved or rejected a repair.
  useEffect(() => {
    const socket = getSocket();
    const onChange = (e) => {
      if (e.id !== id) return;
      if (e.kind === 'recommendation_approved') say('rec', 'good', 'The customer approved a repair.');
      if (e.kind === 'recommendation_rejected') say('rec', 'warn', 'The customer rejected a repair. Do not carry it out.');
      load();
    };
    socket.on('booking:changed', onChange);
    return () => socket.off('booking:changed', onChange);
  }, [id, load]);

  const run = async (key, fn, okText) => {
    say(key, null, null);
    try {
      const { data } = await fn();
      apply(data);
      if (okText) say(key, 'good', okText);
      return true;
    } catch (err) {
      say(key, 'bad', errorMessage(err));
      return false;
    }
  };

  if (error && !job) return <Layout title="Job card"><div className="alert bad">{error}</div><Link to="/center/jobs">Back to Workshop</Link></Layout>;
  if (!job || !insp) return <Layout title="Job card"><p className="muted">Loading…</p></Layout>;

  const b = job.booking;
  const next = NEXT_STEP[b.status];
  const canInspect = ['inspection', 'in_progress'].includes(b.status);
  const open = ['accepted', 'vehicle_received', 'inspection', 'in_progress', 'quality_check'].includes(b.status);
  const partsOpen = ['in_progress', 'quality_check'].includes(b.status) && !b.bill;
  const approvedTotal = b.recommendations.filter((r) => r.status === 'approved').reduce((s, r) => s + r.partsCost + r.labourCost, 0);

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ready = await prepareUpload(file);
    if (ready.tooBig) return say('photo', 'bad', 'This photo is too large. Try a smaller one.');
    const fd = new FormData();
    fd.append('image', ready.file);
    fd.append('kind', photo.kind);
    fd.append('caption', photo.caption);
    setUploading(true);
    await run('photo', () => api.post(`/center/bookings/${id}/photos`, fd), 'Photo added. The customer can see it.');
    setUploading(false);
    setPhoto((p) => ({ ...p, caption: '' }));
  };

  return (
    <Layout
      title={`${b.vehicleSnapshot?.brand} ${b.vehicleSnapshot?.model} · ${b.service.name}`}
      subtitle={`${b.bookingNo} · ${niceDate(b.date)} at ${niceTime(b.slot)} · ${b.customer?.name} · ${b.customer?.phone || b.customer?.email}`}
      actions={<div className="row"><Plate reg={b.vehicleSnapshot?.regNumber} /><span className={`chip ${statusTone(b.status)}`}>{statusLabel(b.status)}</span></div>}
    >
      <div className="card">
        <div className="row job-vehicle">
          <VehicleThumb booking={b} size={110} />
          <div>
            <b>{b.vehicleSnapshot?.brand} {b.vehicleSnapshot?.model}</b>
            <div className="small muted">{[b.vehicle?.fuel, b.vehicle?.year, b.vehicleSnapshot?.km != null ? `${b.vehicleSnapshot.km.toLocaleString('en-IN')} km at booking` : null].filter(Boolean).join(' · ')}</div>
            {!vehiclePhoto(b) && <div className="small muted">No photo from the customer. Check the number plate when the vehicle arrives.</div>}
          </div>
        </div>
        <StatusSteps status={b.status} />
        {b.problem && <div className="small">Customer says: “{b.problem}”</div>}
        <div className="row between align-end">
          <label className="field" style={{ minWidth: 240 }}>
            <span>Mechanic</span>
            <select
              value={b.mechanic?._id || ''}
              disabled={!open}
              onChange={(e) => run('mech', () => api.patch(`/center/bookings/${id}/mechanic`, { mechanicId: e.target.value || null }), e.target.value ? 'Mechanic assigned.' : 'Mechanic removed.')}
            >
              <option value="">Not assigned</option>
              {mechanics.map((m) => <option key={m._id} value={m._id}>{m.name}{m.skills?.length ? ` · ${m.skills.join(', ')}` : ''}</option>)}
            </select>
          </label>
          {next ? (
            <button className="btn primary" onClick={() => run('status', () => api.patch(`/center/bookings/${id}/status`, { status: next.to }), `Status updated: ${statusLabel(next.to)}. The customer has been told.`)}>
              {next.label}
            </button>
          ) : b.status === 'ready_for_pickup' ? (
            <span className="small muted">Waiting for the customer. Hand the vehicle over below with their pickup code.</span>
          ) : b.status === 'completed' ? (
            <span className="chip good">Handed over {b.pickup?.collectedAt ? new Date(b.pickup.collectedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span>
          ) : null}
        </div>
        <Notice msg={msgs.mech} />
        <Notice msg={msgs.status} />
        {msgs.hand?.tone === 'good' && <Notice msg={msgs.hand} />}
      </div>

      {b.bill && b.bill.payment?.status !== 'paid' && ['quality_check', 'ready_for_pickup'].includes(b.status) && (job.payBeforePickup || b.status === 'quality_check') && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); run('pay', () => api.post(`/center/bookings/${id}/payment`, { paymentMethod: hand.paymentMethod }), 'Payment recorded. The customer can now see their pickup code.'); }} noValidate>
          <div className="row between">
            <h3>Record payment</h3>
            {job.payBeforePickup && <span className="chip warn">Pay before pickup</span>}
          </div>
          <p className="small">
            Bill <span className="mono">{b.bill.invoiceNo}</span>: <b>₹{b.bill.total.toLocaleString('en-IN')}</b>.{' '}
            {job.payBeforePickup ? 'Your center releases vehicles only after payment. Record the counter payment here; the customer then sees their pickup code.' : 'Took the payment early? Record it here so handover only needs the pickup code.'}
          </p>
          <div className="row align-end">
            <label className="field"><span>Paid by</span>
              <select value={hand.paymentMethod} onChange={(e) => setHand({ ...hand, paymentMethod: e.target.value })}>
                {['cash', 'card', 'upi_counter'].map((m) => <option key={m} value={m}>{PAY_METHODS[m]}</option>)}
              </select>
            </label>
            <button className="btn primary">Mark ₹{b.bill.total.toLocaleString('en-IN')} as paid</button>
          </div>
          <Notice msg={msgs.pay} />
        </form>
      )}

      {b.status === 'ready_for_pickup' && (() => {
        const paid = b.bill?.payment?.status === 'paid';
        const locked = job.payBeforePickup && !paid;
        return (
          <form className="card handover" onSubmit={(e) => { e.preventDefault(); run('hand', () => api.post(`/center/bookings/${id}/handover`, hand), 'Vehicle handed over. The job is complete.'); }} noValidate>
            <h3>Hand over the vehicle</h3>
            {locked ? (
              <div className="alert warn">Waiting for payment. Your center releases vehicles only after the bill is paid: the customer pays online, or you record the counter payment above.</div>
            ) : (
              <p className="small">Ask the customer for the <b>4-digit pickup code</b> in their app. This proves the right person is collecting the vehicle. {paid ? <>The bill is <b>already paid</b>{b.bill.payment.method ? ` (${PAY_METHODS[b.bill.payment.method] || b.bill.payment.method})` : ''}.</> : <>Take the payment of <b>{b.bill ? `₹${b.bill.total.toLocaleString('en-IN')}` : ''}</b> first.</>}</p>
            )}
            <div className="row align-end">
              <label className="field"><span>Pickup code</span><input className="otp-input" inputMode="numeric" autoComplete="off" maxLength={4} value={hand.otp} disabled={locked} onChange={(e) => setHand({ ...hand, otp: e.target.value.replace(/\D/g, '') })} placeholder="••••" /></label>
              {!paid && !locked && (
                <label className="field"><span>Paid by</span>
                  <select value={hand.paymentMethod} onChange={(e) => setHand({ ...hand, paymentMethod: e.target.value })}>
                    {['cash', 'card', 'upi_counter'].map((m) => <option key={m} value={m}>{PAY_METHODS[m]}</option>)}
                  </select>
                </label>
              )}
              <button className="btn primary" disabled={locked}>Check code & hand over</button>
            </div>
            {msgs.hand?.tone === 'bad' && <Notice msg={msgs.hand} />}
          </form>
        );
      })()}

      <div className="grid2 top">
        <div className="card">
          <h3>Inspection & vehicle health</h3>
          {!canInspect && !job.health && <p className="small muted">Available once you start the inspection.</p>}
          {canInspect ? (
            <form className="list" onSubmit={(e) => { e.preventDefault(); run('insp', () => api.put(`/center/bookings/${id}/inspection`, { ...insp, km: insp.km === '' ? null : Number(insp.km) }), 'Inspection saved. The customer can see it.'); }} noValidate>
              <div className="fgrid">
                {HEALTH_PARTS.map(([k, label]) => (
                  <label key={k} className="field">
                    <span>{label}</span>
                    <select value={insp.items[k]} onChange={(e) => setInsp({ ...insp, items: { ...insp.items, [k]: e.target.value } })}>
                      {Object.entries(HEALTH_VALUES).map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}
                    </select>
                  </label>
                ))}
                <label className="field"><span>Odometer (km)</span><input type="number" min="0" value={insp.km} onChange={(e) => setInsp({ ...insp, km: e.target.value })} /></label>
              </div>
              <label className="field"><span>Inspection notes</span><textarea rows={2} maxLength={500} value={insp.notes} onChange={(e) => setInsp({ ...insp, notes: e.target.value })} placeholder="Front pads worn. Battery weak on load test." /></label>
              <div className="row"><button className="btn primary">{job.health ? 'Update inspection' : 'Save inspection'}</button></div>
            </form>
          ) : job.health && <HealthGrid record={job.health} />}
          <Notice msg={msgs.insp} />
          {job.previous?.length > 0 && (
            <details>
              <summary className="small">Earlier health checks of this vehicle ({job.previous.length})</summary>
              <HealthHistory records={[...job.previous].reverse()} />
            </details>
          )}
        </div>

        <div className="card">
          <div className="row between">
            <h3>Recommended repairs</h3>
            {approvedTotal > 0 && <span className="small">Approved extra work: <b>{inr(approvedTotal)}</b></span>}
          </div>
          <p className="small muted">Extra work you find. The customer approves or rejects each one. Only approved repairs may be done.</p>
          {b.recommendations.length === 0 && <p className="small muted">None yet.</p>}
          <div className="list">
            {b.recommendations.map((r) => (
              <div key={r._id} className={`rec ${r.urgency}`}>
                <div className="row between"><b>{r.problem}</b><span className={`chip ${URGENCY_TONE[r.urgency]}`}>{r.urgency} urgency</span></div>
                <div className="small">{r.reason}</div>
                <div className="row between">
                  <span className="small">Parts {inr(r.partsCost)} + labour {inr(r.labourCost)} = <b>{inr(r.partsCost + r.labourCost)}</b></span>
                  <div className="row">
                    <span className={`chip ${REC_STATUS[r.status].tone}`}>{r.status === 'awaiting' ? 'Waiting for customer — don’t start' : REC_STATUS[r.status].label}</span>
                    {r.done && <span className="chip info">Done</span>}
                    {r.status === 'awaiting' && <button className="btn ghost sm" onClick={() => run('rec', () => api.delete(`/center/bookings/${id}/recommendations/${r._id}`), 'Recommendation removed.')}>Remove</button>}
                    {r.status === 'approved' && !r.done && b.status === 'in_progress' && <button className="btn good sm" onClick={() => run('rec', () => api.patch(`/center/bookings/${id}/recommendations/${r._id}/done`), 'Marked as done.')}>Mark done</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {canInspect && (
            <form className="list item" onSubmit={async (e) => { e.preventDefault(); const ok = await run('rec', () => api.post(`/center/bookings/${id}/recommendations`, { ...rec, partsCost: Number(rec.partsCost || 0), labourCost: Number(rec.labourCost || 0) }), 'Sent to the customer for approval.'); if (ok) setRec(blankRec); }} noValidate>
              <b className="small">Recommend a repair</b>
              <label className="field"><span>Problem</span><input maxLength={120} value={rec.problem} onChange={(e) => setRec({ ...rec, problem: e.target.value })} placeholder="Front brake pads worn" /></label>
              <label className="field"><span>Why it's needed</span><input maxLength={300} value={rec.reason} onChange={(e) => setRec({ ...rec, reason: e.target.value })} placeholder="Pad thickness 2.5 mm, limit is 3 mm" /></label>
              <div className="fgrid">
                <label className="field"><span>Urgency</span><select value={rec.urgency} onChange={(e) => setRec({ ...rec, urgency: e.target.value })}><option>High</option><option>Medium</option><option>Low</option></select></label>
                <label className="field"><span>Parts ₹</span><input type="number" min="0" value={rec.partsCost} onChange={(e) => setRec({ ...rec, partsCost: e.target.value })} /></label>
                <label className="field"><span>Labour ₹</span><input type="number" min="0" value={rec.labourCost} onChange={(e) => setRec({ ...rec, labourCost: e.target.value })} /></label>
              </div>
              <div className="row"><button className="btn primary">Send to customer</button></div>
            </form>
          )}
          <Notice msg={msgs.rec} />
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h3>Parts & bill</h3>
          {b.bill && <button className="btn sm" onClick={() => downloadFile(`/center/bookings/${id}/invoice.pdf`, `${b.bill.invoiceNo}.pdf`).catch((e) => say('bill', 'bad', errorMessage(e)))}>Download invoice PDF</button>}
        </div>
        {['accepted', 'vehicle_received', 'inspection'].includes(b.status) && <p className="small muted">Parts can be added once the work starts (Service in progress).</p>}
        {partsOpen && (
          <>
            <form className="row align-end" onSubmit={async (e) => { e.preventDefault(); const ok = await run('parts', () => api.post(`/center/bookings/${id}/parts`, { partId: use.partId, qty: Number(use.qty) }), 'Part added to the job and taken out of stock.'); if (ok) { setUse({ partId: '', qty: 1 }); loadParts(); } }} noValidate>
              <label className="field grow"><span>Spare part used</span>
                <select value={use.partId} onChange={(e) => setUse({ ...use, partId: e.target.value })}>
                  <option value="">Choose a part…</option>
                  {parts.map((p) => <option key={p._id} value={p._id} disabled={p.stock < 1}>{p.name} · ₹{p.unitPrice} · {p.stock < 1 ? 'out of stock' : `${p.stock} in stock`}</option>)}
                </select>
              </label>
              <label className="field"><span>Qty</span><input type="number" min="1" max="50" value={use.qty} onChange={(e) => setUse({ ...use, qty: e.target.value })} style={{ width: 70 }} /></label>
              <button className="btn">Add part</button>
            </form>
            {b.partsUsed.length > 0 && (
              <ul className="plain">
                {b.partsUsed.map((l) => (
                  <li key={l._id} className="row between small">
                    <span>{l.qty} × {l.name}{l.partNo ? <span className="muted mono"> {l.partNo}</span> : ''}</span>
                    <button className="btn ghost sm" onClick={async () => { if (await run('parts', () => api.delete(`/center/bookings/${id}/parts/${l._id}`), 'Removed. The part is back in stock.')) loadParts(); }}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <Notice msg={msgs.parts} />
          </>
        )}
        {job.billPreview && (
          <>
            <BillTable bill={job.billPreview} preview />
            {['quality_check', 'ready_for_pickup'].includes(b.status) ? (
              <div className="row between">
                <span className="small muted">Check the lines above. Once final, the bill can't be changed.</span>
                <button className="btn primary" onClick={() => { say('status', null, null); run('bill', () => api.post(`/center/bookings/${id}/bill`), 'Final bill created. The customer can see it now.'); }}>Generate final bill</button>
              </div>
            ) : <p className="small muted">The service charge, approved repairs and parts are added automatically. Generate the final bill in Quality check.</p>}
          </>
        )}
        {b.bill && <BillTable bill={b.bill} bookingId={b._id} />}
        {b.bill && b.bill.payment?.status !== 'paid' && <PaymentRequests bookingId={id} onChanged={load} />}
        <Notice msg={msgs.bill} />
      </div>

      <div className="card">
        <div className="row between"><h3>Photo proof</h3><span className="small muted">{b.photos.length} photo{b.photos.length === 1 ? '' : 's'} · the customer can see these</span></div>
        <PhotoGrid photos={b.photos} onDelete={(pid) => run('photo', () => api.delete(`/center/bookings/${id}/photos/${pid}`), 'Photo removed.')} />
        {b.status !== 'accepted' && (
          <div className="row align-end">
            <label className="field"><span>Type</span><select value={photo.kind} onChange={(e) => setPhoto({ ...photo, kind: e.target.value })}><option value="before">Before</option><option value="after">After</option><option value="other">Other</option></select></label>
            <label className="field grow"><span>Caption</span><input maxLength={120} value={photo.caption} onChange={(e) => setPhoto({ ...photo, caption: e.target.value })} placeholder="Old brake pad, 2.5 mm" /></label>
            <label className="btn">{uploading ? 'Uploading…' : 'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={uploadPhoto} /></label>
          </div>
        )}
        <Notice msg={msgs.photo} />
      </div>
    </Layout>
  );
}
