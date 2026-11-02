import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout.jsx';
import Notice from '../../components/Notice.jsx';
import useMyLocation from '../../hooks/useMyLocation.js';
import { useAuth } from '../../context/AuthContext.jsx';
import api, { errorMessage } from '../../api/client.js';
import { getSocket } from '../../api/socket.js';
import { TOW_STATUS } from '../../utils/towing.js';

const OPEN = ['requested', 'accepted', 'on_the_way'];
const STEPS = ['requested', 'accepted', 'on_the_way', 'completed'];
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// "Stuck on the way?": shares the customer's location, lists the nearest centers that tow,
// lets them call a tow truck directly or send a tow request, and shows the request's progress.
export default function CustomerTowing() {
  const [params] = useSearchParams();
  const bookingId = params.get('booking') || '';
  const { user } = useAuth();
  const { loc, asking, error: locError, ask } = useMyLocation();
  const [centers, setCenters] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [requests, setRequests] = useState(null);
  const [form, setForm] = useState({ centerId: '', vehicleId: '', phone: user?.phone || '', note: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [cancelMsg, setCancelMsg] = useState(null);

  const loadRequests = useCallback(() => api.get('/towing/requests').then(({ data }) => setRequests(data)).catch(() => setRequests([])), []);
  useEffect(() => {
    loadRequests();
    api.get('/vehicles').then(({ data }) => { setVehicles(data); setForm((f) => ({ ...f, vehicleId: f.vehicleId || data[0]?._id || '' })); }).catch(() => {});
  }, [loadRequests]);

  // A fresh location every time the page opens: the customer is somewhere on the road, not where they were earlier.
  useEffect(() => { ask(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loc) return;
    setCenters(null);
    api.get('/towing/nearby', { params: { lat: loc.lat, lng: loc.lng, ...(bookingId ? { bookingId } : {}) } })
      .then(({ data }) => setCenters(data.centers)).catch((e) => { setCenters([]); setMsg({ tone: 'bad', text: errorMessage(e) }); });
  }, [loc, bookingId]);

  // Live: the center accepted, is on the way, or towed the vehicle.
  useEffect(() => {
    const socket = getSocket();
    socket.on('tow:changed', loadRequests);
    return () => socket.off('tow:changed', loadRequests);
  }, [loadRequests]);

  const active = (requests || []).find((r) => OPEN.includes(r.status));
  const past = (requests || []).filter((r) => r !== active).slice(0, 5);

  const send = async (e) => {
    e.preventDefault();
    if (!form.centerId) { setMsg({ tone: 'bad', text: 'Choose a center to send the request to.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      await api.post('/towing/requests', { ...form, lat: loc.lat, lng: loc.lng, ...(bookingId ? { bookingId } : {}) });
      setMsg({ tone: 'good', text: 'Tow request sent with your location. The center has been notified; you will see updates here.' });
      setForm((f) => ({ ...f, note: '' }));
      loadRequests();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setMsg({ tone: 'bad', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setCancelMsg(null);
    try { await api.patch(`/towing/requests/${active._id}/cancel`); loadRequests(); } catch (e) { setCancelMsg({ tone: 'bad', text: errorMessage(e) }); }
  };

  return (
    <Layout title="Roadside help" subtitle="Broken down on the way? Find the nearest tow truck, call it, or send a tow request with your location.">
      <div className="card tow-hero">
        <div className="row between">
          <div>
            <b>🚨 Stuck on the road?</b>
            <div className="small">Stay safe: move to the side, turn on hazard lights, and keep your phone with you.</div>
          </div>
          <button type="button" className="btn primary" onClick={ask} disabled={asking}>{asking ? 'Finding you…' : loc ? 'Update my location' : 'Share my location'}</button>
        </div>
        {loc && <div className="small muted">Your location: {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)} · <a href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer">check on map</a></div>}
        {locError && <div className="alert warn">{locError} Without your location, call a center below or call 112 in an emergency.</div>}
        <div className="small">Accident or injury? Call <a href="tel:112"><b>112</b></a> (emergency) first.</div>
      </div>

      {active && (
        <div className="card tow-active">
          <div className="row between">
            <h3>Your tow request</h3>
            <span className={`chip ${TOW_STATUS[active.status].tone}`}>{TOW_STATUS[active.status].label}</span>
          </div>
          <ol className="tow-steps">
            {STEPS.map((s) => (
              <li key={s} className={STEPS.indexOf(s) <= STEPS.indexOf(active.status) ? 'done' : ''}>{TOW_STATUS[s].label}</li>
            ))}
          </ol>
          <div className="small"><b>{active.center?.name}</b> · sent {when(active.createdAt)} · {active.distanceKm} km away</div>
          {active.centerNote && <div className="alert info small">{active.center?.name}: {active.centerNote}</div>}
          <div className="row small">
            {active.center?.phone && <a className="btn sm primary" href={`tel:${active.center.phone}`}>📞 Call center</a>}
            {(active.center?.towing?.contacts || []).slice(0, 2).map((c) => <a key={c.phone} className="btn sm" href={`tel:${c.phone}`}>📞 {c.name}</a>)}
            {active.status === 'requested' && <button type="button" className="btn ghost sm" onClick={cancel}>Cancel request</button>}
            {active.status !== 'requested' && <button type="button" className="btn ghost sm" onClick={cancel}>Cancel</button>}
          </div>
          <Notice msg={cancelMsg} />
        </div>
      )}
      <Notice msg={msg} />

      <div className="card">
        <h3>Nearest centers with towing</h3>
        {!loc ? <p className="small muted">Share your location to see centers whose tow trucks reach you.</p>
          : centers === null ? <p className="small muted">Looking for tow trucks near you…</p>
            : centers.length === 0 ? <div className="empty small">No center on MotoClinicz offers towing where you are. Call 112 in an emergency, or a local towing service.</div>
              : (
                <div className="list">
                  {centers.map((c) => (
                    <div key={c._id} className={`item tow-center ${form.centerId === c._id ? 'sel' : ''}`}>
                      <div className="row between">
                        <div>
                          <b>{c.name}</b> {c.booked && <span className="chip good">Your booked center</span>}
                          <div className="small muted">{c.address} · <b>{c.distanceKm} km</b> away</div>
                        </div>
                        <span className={`chip ${c.availableNow ? 'good' : 'warn'}`}>{c.available24x7 ? '24 × 7' : c.availableNow ? 'Available now' : 'Closed now, call to check'}</span>
                      </div>
                      {c.charges && <div className="small">Charges: {c.charges}</div>}
                      <div className="row small">
                        {c.contacts.map((x) => (
                          <a key={x.phone} className="btn sm primary" href={`tel:${x.phone}`} title={x.vehicleLabel}>📞 {x.name} · {x.vehicleLabel}</a>
                        ))}
                        <a className="btn sm" href={`tel:${c.phone}`}>📞 Center desk</a>
                        {!active && <button type="button" className="btn sm" onClick={() => { setForm((f) => ({ ...f, centerId: c._id })); document.getElementById('tow-form')?.scrollIntoView({ behavior: 'smooth' }); }}>Request a tow</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
      </div>

      {!active && loc && centers?.length > 0 && (
        <form id="tow-form" className="card" onSubmit={send} noValidate>
          <h3>Send a tow request</h3>
          <p className="small muted">The center gets your location on a map and your phone number, and updates you here.</p>
          <div className="fgrid">
            <label className="field"><span>Center</span>
              <select value={form.centerId} onChange={(e) => setForm({ ...form, centerId: e.target.value })}>
                <option value="">Choose a center</option>
                {centers.map((c) => <option key={c._id} value={c._id}>{c.name} · {c.distanceKm} km</option>)}
              </select>
            </label>
            <label className="field"><span>Vehicle</span>
              <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                {vehicles.length === 0 && <option value="">No vehicles saved</option>}
                {vehicles.map((v) => <option key={v._id} value={v._id}>{v.brand} {v.model} · {v.regNumber}</option>)}
              </select>
            </label>
            <label className="field"><span>Your phone number</span><input inputMode="tel" maxLength={15} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" /></label>
            <label className="field full"><span>What happened? Where exactly? (optional)</span><input maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Engine stopped, near Pumpwell flyover, left side" /></label>
          </div>
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send tow request'}</button></div>
        </form>
      )}

      {past.length > 0 && (
        <div className="card">
          <h3>Earlier requests</h3>
          <ul className="plain">
            {past.map((r) => (
              <li key={r._id} className="row between small">
                <span>{when(r.createdAt)} · {r.center?.name} · {r.vehicle?.regNumber}</span>
                <span className={`chip ${TOW_STATUS[r.status].tone}`}>{TOW_STATUS[r.status].label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {bookingId && <p className="small"><Link to={`/customer/bookings/${bookingId}`}>← Back to your booking</Link></p>}
    </Layout>
  );
}
