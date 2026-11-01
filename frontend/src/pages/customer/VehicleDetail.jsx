import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import Layout from '../../components/Layout.jsx';
import { niceDate } from '../../utils/booking.js';
import Plate from '../../components/Plate.jsx';
import Suggestions from '../../components/Suggestions.jsx';
import { HealthHistory } from '../../components/HealthView.jsx';
import ServiceHistoryCard from '../../components/ServiceHistoryCard.jsx';
import DatePicker from '../../components/DatePicker.jsx';
import { DOC_YEARS, docQuick } from '../../utils/docDates.js';
import api, { errorMessage } from '../../api/client.js';
import { prepareUpload } from '../../utils/shrinkImage.js';
import { fmtDate, fmtKm, toInputDate, docStatus, DOC_LABELS, kmPerDay } from '../../utils/format.js';

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [v, setV] = useState(null);
  const [error, setError] = useState('');

  const [km, setKm] = useState('');
  const [kmMsg, setKmMsg] = useState(null);
  const [docs, setDocs] = useState({});
  const [docMsg, setDocMsg] = useState(null);
  // The Add vehicle form passes a message here when the photo chosen there could not be uploaded.
  const [photoMsg, setPhotoMsg] = useState(location.state?.photoMsg || null);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [health, setHealth] = useState(null);

  const apply = (data) => {
    setV(data);
    setKm(String(data.km));
    setDocs(Object.fromEntries(Object.keys(DOC_LABELS).map((k) => [k, toInputDate(data.documents?.[k])])));
  };

  useEffect(() => {
    api.get(`/vehicles/${id}`).then(({ data }) => apply(data)).catch((e) => setError(errorMessage(e)));
    api.get(`/vehicles/${id}/health`).then(({ data }) => setHealth(data)).catch(() => setHealth([]));
  }, [id]);

  const saveKm = async (e) => {
    e.preventDefault();
    setKmMsg(null);
    try {
      const { data } = await api.post(`/vehicles/${id}/odometer`, { km: Number(km) });
      apply(data);
      setKmMsg({ tone: 'good', text: 'Odometer updated.' });
    } catch (err) {
      setKmMsg({ tone: 'bad', text: errorMessage(err) });
    }
  };

  const saveDocs = async (e) => {
    e.preventDefault();
    setDocMsg(null);
    try {
      const { data } = await api.put(`/vehicles/${id}/documents`, docs);
      apply(data);
      setDocMsg({ tone: 'good', text: 'Dates saved.' });
    } catch (err) {
      setDocMsg({ tone: 'bad', text: errorMessage(err) });
    }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoMsg(null);
    setUploading(true);
    try {
      const ready = await prepareUpload(file);
      if (ready.tooBig) return setPhotoMsg({ tone: 'bad', text: 'This photo is too large. Try a smaller one.' });
      const fd = new FormData();
      fd.append('image', ready.file);
      const { data } = await api.post(`/vehicles/${id}/image`, fd);
      apply(data);
      setPhotoMsg({ tone: 'good', text: 'Photo uploaded.' });
    } catch (err) {
      setPhotoMsg({ tone: 'bad', text: errorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    try {
      const { data } = await api.delete(`/vehicles/${id}/image`);
      apply(data);
      setPhotoMsg(null);
    } catch (err) {
      setPhotoMsg({ tone: 'bad', text: errorMessage(err) });
    }
  };

  const removeVehicle = async () => {
    try {
      await api.delete(`/vehicles/${id}`);
      navigate('/customer/vehicles', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (error && !v) return <Layout title="Vehicle"><div className="alert bad">{error}</div><Link to="/customer/vehicles">Back to My Vehicles</Link></Layout>;
  if (!v) return <Layout title="Vehicle"><p className="muted">Loading…</p></Layout>;

  const history = [...v.odometer].sort((a, b) => new Date(b.date) - new Date(a.date));
  const rate = kmPerDay(v.odometer);

  return (
    <Layout
      title={`${v.brand} ${v.model}`}
      subtitle={`${v.type} · ${v.variant ? v.variant + ' · ' : ''}${v.year} · ${v.fuel}`}
      actions={<div className="row"><Plate reg={v.regNumber} /><Link className="btn" to={`/customer/vehicles/${id}/edit`}>Edit details</Link><Link className="btn primary" to={`/customer/book?vehicle=${id}`}>Book service</Link></div>}
    >
      {error && <div className="alert bad">{error}</div>}

      <Suggestions vehicleId={id} />

      <div className="grid2 top">
        <div className="card">
          <h3>Photo</h3>
          <div className="vphoto large">
            {v.image?.url ? <img src={v.image.url} alt={`${v.brand} ${v.model}`} /> : <span>No photo yet</span>}
          </div>
          <div className="row">
            <label className="btn">
              {uploading ? 'Uploading…' : v.image?.url ? 'Replace photo' : 'Upload photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} hidden disabled={uploading} />
            </label>
            {v.image?.url && <button className="btn bad" onClick={removePhoto}>Remove photo</button>}
          </div>
          <p className="small muted">JPG, PNG or WebP. Large phone photos are made smaller before uploading.</p>
          {photoMsg && <div className={`alert ${photoMsg.tone}`}>{photoMsg.text}</div>}
        </div>

        <form className="card" onSubmit={saveDocs}>
          <h3>Documents</h3>
          {Object.entries(DOC_LABELS).map(([k, label]) => {
            const s = docStatus(v.documents?.[k]);
            return (
              <div key={k} className="field">
                <span>{label} expiry <em className={`chip ${s.tone}`}>{s.text}</em></span>
                <DatePicker label={`${label} expiry`} placeholder="Not set" value={docs[k] || ''} onChange={(d) => setDocs({ ...docs, [k]: d })} quick={docQuick(k)} clearable {...DOC_YEARS} />
              </div>
            );
          })}
          <div className="row"><button className="btn primary">Save dates</button></div>
          {docMsg && <div className={`alert ${docMsg.tone}`}>{docMsg.text}</div>}
        </form>
      </div>

      <div className="card">
        <div className="row between">
          <h3>Odometer</h3>
          <span className="small muted">{rate ? `About ${Math.round(rate)} km a day` : 'Add readings over time to see your average'}</span>
        </div>
        {v.lastService?.date && (
          <div className="small">Last service: <b>{v.lastService.serviceName}</b> on {niceDate(v.lastService.date)}{v.lastService.km != null ? ` at ${v.lastService.km.toLocaleString('en-IN')} km` : ''}</div>
        )}
        <form className="row align-end" onSubmit={saveKm} noValidate>
          <label className="field" style={{ maxWidth: 220 }}>
            <span>Current reading (km)</span>
            <input type="number" min={v.km} value={km} onChange={(e) => setKm(e.target.value)} />
          </label>
          <button className="btn primary">Update</button>
        </form>
        {kmMsg && <div className={`alert ${kmMsg.tone}`}>{kmMsg.text}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th className="num">Reading</th><th>Recorded by</th></tr></thead>
            <tbody>
              {history.map((o, i) => (
                <tr key={i}><td>{fmtDate(o.date)}</td><td className="num">{fmtKm(o.km)}</td><td>{o.source === 'service' ? 'Service center' : 'You'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">From Phase 8, the next service is due 6 months or 10,000 km after the last service, whichever comes first.</p>
      </div>

      <ServiceHistoryCard vehicleId={id} regNumber={v.regNumber} />

      <div className="card">
        <h3>Health history</h3>
        <p className="small muted">The condition of each part at every inspection, oldest first, so you can see how it changes over time.</p>
        {health === null ? <p className="muted small">Loading…</p> : <HealthHistory records={health} />}
      </div>

      <div className="card danger">
        <h3>Remove vehicle</h3>
        <p className="small muted">It disappears from your list. Its records are kept for bills and service history.</p>
        {confirmRemove ? (
          <div className="row">
            <span>Remove {v.brand} {v.model}?</span>
            <button className="btn bad" onClick={removeVehicle}>Yes, remove</button>
            <button className="btn" onClick={() => setConfirmRemove(false)}>Keep it</button>
          </div>
        ) : (
          <div><button className="btn bad" onClick={() => setConfirmRemove(true)}>Remove vehicle</button></div>
        )}
      </div>
    </Layout>
  );
}
