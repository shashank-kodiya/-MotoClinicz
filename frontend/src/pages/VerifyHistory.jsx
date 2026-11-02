import { Fragment, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { inr, niceDate } from '../utils/booking.js';

const km = (k) => (Number.isFinite(k) ? `${k.toLocaleString('en-IN')} km` : '–');
const HEALTH = { good: 'Good', needs_attention: 'Needs attention', replace_soon: 'Replace soon', critical: 'Critical', replaced: 'Replaced', changed: 'Changed' };
const PARTS = [['Engine', 'engine'], ['Brakes', 'brakes'], ['Tyres', 'tyres'], ['Battery', 'battery'], ['Engine oil', 'engineOil']];

// Public page opened by scanning the QR code on a vehicle's service history report. No login needed.
// It shows the live record, so a buyer can compare it with the printed report.
export default function VerifyHistory() {
  const { token } = useParams();
  const [res, setRes] = useState(null);

  useEffect(() => {
    api.get(`/meta/vehicle-history/${token}`)
      .then(({ data }) => setRes(data))
      .catch((e) => setRes({ valid: false, message: errorMessage(e) }));
  }, [token]);

  const v = res?.vehicle;
  return (
    <div className="auth-wrap">
      <div className="card verify-card history-card">
        <div className="brand"><span className="brand-mark">MC</span><div><b>MotoClinicz</b><span>Service history check</span></div></div>
        {!res ? <p className="muted">Checking…</p> : res.valid ? (
          <>
            <div className="alert good">
              <span className="verify-mark" aria-hidden="true">✓</span>
              <b>Genuine service record.</b>
              <span className="small">{res.services.length} service{res.services.length === 1 ? '' : 's'} recorded by authorised centers. This is the live record from our database.</span>
            </div>

            <dl className="kv">
              <dt>Vehicle</dt><dd><b>{v.brand} {v.model}{v.variant ? ` ${v.variant}` : ''}</b> · {v.year} · {v.fuel}</dd>
              <dt>Registration</dt><dd className="mono">{v.regNumber}</dd>
              <dt>Odometer</dt><dd>{km(v.km)} (latest reading)</dd>
              <dt>Odometer check</dt>
              <dd>{res.odometerConsistent
                ? <span className="chip good">Consistent</span>
                : <span className="chip warn">Went down between services, ask the seller</span>}</dd>
              {res.totalSpent > 0 && <><dt>Total spent</dt><dd>{inr(res.totalSpent)}</dd></>}
            </dl>

            <h3>Services</h3>
            {res.services.length === 0 ? <p className="small muted">No completed services on the platform yet.</p> : (
              <ol className="history-list">
                {[...res.services].reverse().map((s, i) => (
                  <li key={i}>
                    <div className="row between"><b>{niceDate(s.date)}</b><span className="mono small">{km(s.km)}</span></div>
                    <div className="small">{[s.service, ...s.repairs].join(', ')}{s.total != null ? ` · ${inr(s.total)}` : ''}</div>
                    {s.parts.length > 0 && <div className="small muted">Parts: {s.parts.join(', ')}</div>}
                    <div className="small muted">{s.center}</div>
                  </li>
                ))}
              </ol>
            )}

            {res.latestHealth && (
              <>
                <h3>Condition at last inspection</h3>
                <p className="small muted">{niceDate(res.latestHealth.date)}{Number.isFinite(res.latestHealth.km) ? ` · ${km(res.latestHealth.km)}` : ''}</p>
                <dl className="kv">
                  {PARTS.map(([label, k]) => <Fragment key={k}><dt>{label}</dt><dd>{HEALTH[res.latestHealth.items?.[k]] || '–'}</dd></Fragment>)}
                </dl>
              </>
            )}

            <p className="small muted">
              Compare this with the printed report. If any service, date or km reading on the paper is different or missing here,
              the paper has been changed. The owner's name and phone are not shown.
            </p>
          </>
        ) : (
          <div className="alert bad">
            <span className="verify-mark" aria-hidden="true">✗</span>
            <b>Report not found.</b>
            <span className="small">{res.message}</span>
          </div>
        )}
        <Link className="small" to="/login">Go to MotoClinicz</Link>
      </div>
    </div>
  );
}
