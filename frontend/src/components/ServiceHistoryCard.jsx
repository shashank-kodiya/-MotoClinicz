import { useCallback, useEffect, useState } from 'react';
import api, { downloadFile, errorMessage } from '../api/client.js';
import Notice from './Notice.jsx';
import { inr, niceDate } from '../utils/booking.js';

const km = (k) => (Number.isFinite(k) ? `${k.toLocaleString('en-IN')} km` : '–');

// "Service history report" on a vehicle's page: every completed service, a PDF to give a buyer,
// and the link/QR the buyer uses to check the report. The owner can switch the link off.
export default function ServiceHistoryCard({ vehicleId, regNumber }) {
  const [h, setH] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [confirmStop, setConfirmStop] = useState(false);

  const load = useCallback(() => api.get(`/vehicles/${vehicleId}/history`).then(({ data }) => setH(data)).catch((e) => setMsg({ tone: 'bad', text: errorMessage(e) })), [vehicleId]);
  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setMsg(null);
    setBusy('pdf');
    try {
      await downloadFile(`/vehicles/${vehicleId}/history.pdf`, `Service-history-${regNumber}.pdf`);
      await load(); // the first download switches the share link on
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(h.shareUrl); setMsg({ tone: 'good', text: 'Link copied. Send it to the buyer.' }); } catch { setMsg({ tone: 'bad', text: 'Could not copy. Select the link and copy it.' }); }
  };

  const stop = async () => {
    setBusy('stop');
    try {
      const { data } = await api.delete(`/vehicles/${vehicleId}/history-share`);
      setMsg({ tone: 'good', text: data.message });
      setConfirmStop(false);
      await load();
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="card">
      <div className="row between">
        <h3>Service history report</h3>
        {h && <span className={`chip ${h.odometerConsistent ? 'good' : 'warn'}`}>{h.odometerConsistent ? 'Odometer consistent' : 'Odometer went down'}</span>}
      </div>
      <p className="small muted">
        Selling this vehicle? Download a report of every service done through MotoClinicz. It has a QR code the buyer
        can scan to see the live record, so they know it is genuine. Your name and phone are not shown.
      </p>

      {!h ? <p className="muted small">Loading…</p> : (
        <>
          <div className="row small">
            <span><b>{h.services.length}</b> service{h.services.length === 1 ? '' : 's'} on record</span>
            {h.lastService && <span className="muted">· Last: {niceDate(h.lastService.date)}{Number.isFinite(h.lastService.km) ? ` at ${km(h.lastService.km)}` : ''}</span>}
            {h.totalSpent > 0 && <span className="muted">· Total spent {inr(h.totalSpent)}</span>}
          </div>

          {h.services.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th className="num">Odometer</th><th>Service center</th><th>Work done</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {[...h.services].reverse().map((s, i) => (
                    <tr key={i}>
                      <td>{niceDate(s.date)}</td>
                      <td className="num">{km(s.km)}</td>
                      <td>{s.center}</td>
                      <td>{[s.service, ...s.repairs].join(', ')}{s.parts.length > 0 && <div className="small muted">Parts: {s.parts.join(', ')}</div>}</td>
                      <td className="num">{s.total != null ? inr(s.total) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty small">No completed services yet. Services appear here after you collect the vehicle from a center.</div>
          )}

          <div className="row">
            <button type="button" className="btn primary" onClick={download} disabled={!!busy}>{busy === 'pdf' ? 'Preparing PDF…' : 'Download report (PDF)'}</button>
            {h.shareUrl && (
              <>
                <button type="button" className="btn" onClick={copy}>Copy share link</button>
                <a className="btn" href={h.shareUrl} target="_blank" rel="noreferrer">Open buyer's view</a>
              </>
            )}
          </div>

          {h.shareUrl ? (
            <div className="small">
              <span className="chip good">Sharing on</span> Anyone with the QR or link can see this vehicle's service record.{' '}
              {confirmStop ? (
                <span className="row">
                  <span>Turn sharing off? Printed QR codes will stop working.</span>
                  <button type="button" className="btn bad sm" onClick={stop} disabled={!!busy}>{busy === 'stop' ? 'Turning off…' : 'Yes, turn off'}</button>
                  <button type="button" className="btn sm" onClick={() => setConfirmStop(false)}>Keep on</button>
                </span>
              ) : (
                <button type="button" className="btn ghost sm" onClick={() => setConfirmStop(true)}>Turn sharing off</button>
              )}
            </div>
          ) : (
            <p className="small muted">Sharing is off. Downloading the report turns on a new link for its QR code.</p>
          )}
        </>
      )}
      <Notice msg={msg} />
    </div>
  );
}
