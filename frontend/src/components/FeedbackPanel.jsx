import { useEffect, useState, useCallback } from 'react';
import Notice from './Notice.jsx';
import ComplaintThread, { COMPLAINT_LABELS } from './ComplaintThread.jsx';
import { Stars, StarInput } from './Stars.jsx';
import api, { errorMessage } from '../api/client.js';

// Customer: rate the job after pickup, and report a problem at any point after the vehicle arrived.
export default function FeedbackPanel({ bookingId, status }) {
  const [fb, setFb] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [rMsg, setRMsg] = useState(null);
  const [cForm, setCForm] = useState({ category: '', description: '' });
  const [cMsg, setCMsg] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/bookings/${bookingId}/feedback`).then(({ data }) => setFb(data)).catch(() => setFb(null));
  }, [bookingId]);
  useEffect(() => { load(); }, [load, status]);

  const submitReview = async (e) => {
    e.preventDefault();
    setRMsg(null);
    if (!rating) return setRMsg({ tone: 'bad', text: 'Choose 1 to 5 stars.' });
    setBusy(true);
    try {
      await api.post(`/bookings/${bookingId}/review`, { rating, comment });
      setRMsg({ tone: 'good', text: 'Thank you! Your review helps other customers.' });
      load();
    } catch (err) { setRMsg({ tone: 'bad', text: errorMessage(err) }); } finally { setBusy(false); }
  };

  const submitComplaint = async (e) => {
    e.preventDefault();
    setCMsg(null);
    setBusy(true);
    try {
      await api.post(`/bookings/${bookingId}/complaints`, cForm);
      setCForm({ category: '', description: '' });
      setOpen(false);
      setCMsg({ tone: 'good', text: 'Your complaint was sent to the service center and to MotoClinicz support.' });
      load();
    } catch (err) { setCMsg({ tone: 'bad', text: errorMessage(err) }); } finally { setBusy(false); }
  };

  if (!fb) return null;

  return (
    <div className="card">
      <h3>Your feedback</h3>

      {fb.review ? (
        <div className="list">
          <div><Stars value={fb.review.rating} /> <span className="small muted">Your review</span></div>
          {fb.review.comment && <p>{fb.review.comment}</p>}
          {fb.review.reply?.text && <div className="bubble service_center"><span className="small muted">Reply from the service center</span><span>{fb.review.reply.text}</span></div>}
        </div>
      ) : fb.canReview ? (
        <form className="list" onSubmit={submitReview} noValidate>
          <b>How was the service?</b>
          <StarInput value={rating} onChange={setRating} />
          <label className="field"><span>Comment (optional)</span><textarea rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What went well? What could be better?" /></label>
          <div className="row"><button className="btn primary" disabled={busy}>Submit review</button></div>
        </form>
      ) : status !== 'completed' ? (
        <p className="small muted">You can rate this service after you collect your vehicle.</p>
      ) : null}
      <Notice msg={rMsg} />

      <hr className="rule" />
      <div className="row between">
        <b>Problems</b>
        {fb.canComplain && !open && <button className="btn sm" onClick={() => setOpen(true)}>Report a problem</button>}
      </div>
      {open && (
        <form className="list" onSubmit={submitComplaint} noValidate>
          <label className="field"><span>What is it about?</span>
            <select value={cForm.category} onChange={(e) => setCForm({ ...cForm, category: e.target.value })}>
              <option value="">Choose…</option>
              {Object.entries(COMPLAINT_LABELS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
          <label className="field"><span>Describe the problem</span><textarea rows={3} maxLength={1000} value={cForm.description} onChange={(e) => setCForm({ ...cForm, description: e.target.value })} placeholder="What happened, and what would you like the center to do?" /></label>
          <div className="row"><button className="btn primary" disabled={busy}>Send complaint</button><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
      {fb.complaints.length === 0 && !open && <p className="small muted">{fb.canComplain ? 'Nothing reported.' : 'You can report a problem once your vehicle is at the workshop.'}</p>}
      {fb.complaints.map((c) => (
        <ComplaintThread
          key={c._id} c={c}
          onSend={async (text) => { await api.post(`/bookings/${bookingId}/complaints/${c._id}/messages`, { text }); load(); }}
          onResolve={async () => { await api.patch(`/bookings/${bookingId}/complaints/${c._id}/resolve`); load(); }}
          resolveLabel="My problem is solved"
        />
      ))}
      <Notice msg={cMsg} />
    </div>
  );
}
