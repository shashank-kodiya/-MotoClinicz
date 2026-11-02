import { useState } from 'react';
import Notice from './Notice.jsx';
import { errorMessage } from '../api/client.js';

export const COMPLAINT_LABELS = {
  service_quality: 'Service quality', overcharging: 'Overcharging', delay: 'Delay', staff_behaviour: 'Staff behaviour', damage: 'Damage to vehicle', other: 'Other'
};
const WHO = { customer: 'Customer', service_center: 'Service center', admin: 'MotoClinicz support' };
const TONE = { open: 'warn', responded: 'info', resolved: 'good' };
const STATUS_TEXT = { open: 'Waiting for the center', responded: 'Center / support replied', resolved: 'Resolved' };

// One complaint as a short conversation. The page decides what the buttons do:
//   onSend(text)     adds a message          onResolve(text?)  closes the complaint
export default function ComplaintThread({ c, onSend, onResolve, resolveLabel = 'Mark as resolved', resolveWithNote = false, header }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn, ok) => {
    setBusy(true);
    setMsg(null);
    try { await fn(); setText(''); if (ok) setMsg({ tone: 'good', text: ok }); } catch (err) { setMsg({ tone: 'bad', text: errorMessage(err) }); } finally { setBusy(false); }
  };

  return (
    <div className="card inner">
      <div className="row between">
        <div>{header || <b>{c.bookingNo}</b>} <span className="small muted">· {COMPLAINT_LABELS[c.category]}</span></div>
        <span className={`chip ${TONE[c.status]}`}>{STATUS_TEXT[c.status]}</span>
      </div>
      <ul className="plain thread">
        {c.messages.map((m, i) => (
          <li key={i} className={`bubble ${m.by}`}>
            <span className="small muted">{WHO[m.by]} · {new Date(m.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
            <span>{m.text}</span>
          </li>
        ))}
      </ul>
      {c.isOpen && (onSend || onResolve) && (
        <>
          <label className="field"><span>{resolveWithNote ? 'Message, or a closing note' : 'Your message'}</span><textarea rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></label>
          <div className="row">
            {onSend && <button className="btn primary sm" disabled={busy || text.trim().length < 2} onClick={() => run(() => onSend(text.trim()), 'Message sent.')}>Send message</button>}
            {onResolve && <button className="btn good sm" disabled={busy} onClick={() => run(() => onResolve(text.trim()), 'Marked as resolved.')}>{resolveLabel}</button>}
          </div>
        </>
      )}
      {!c.isOpen && <p className="small muted">Closed {c.resolution?.by === 'admin' ? 'by MotoClinicz support' : 'by the customer'}.</p>}
      <Notice msg={msg} />
    </div>
  );
}
