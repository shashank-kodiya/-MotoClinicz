import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Layout from '../../components/Layout.jsx';
import useVehicleOptions from '../../hooks/useVehicleOptions.js';
import api, { errorMessage } from '../../api/client.js';
import { formatReg } from '../../utils/format.js';
import DatePicker from '../../components/DatePicker.jsx';
import { DOC_FIELDS, DOC_YEARS, docQuick } from '../../utils/docDates.js';
import { prepareUpload } from '../../utils/shrinkImage.js';

const blank = { type: 'Car', brand: '', model: '', variant: '', year: new Date().getFullYear(), regNumber: '', fuel: 'Petrol', km: '' };
const blankDocs = { insuranceExpiry: '', pucExpiry: '', rcExpiry: '' };

// Used for both "Add vehicle" (/customer/vehicles/new) and "Edit" (/customer/vehicles/:id/edit).
export default function VehicleForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const options = useVehicleOptions();
  const [form, setForm] = useState(blank);
  const [docs, setDocs] = useState(blankDocs);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [photo, setPhoto] = useState(null);      // { file, preview } chosen on the Add form
  const [photoError, setPhotoError] = useState('');

  useEffect(() => () => photo && URL.revokeObjectURL(photo.preview), [photo]);

  const choosePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    const ready = await prepareUpload(file);
    if (ready.tooBig) return setPhotoError('This photo is too large. Try a smaller one.');
    setPhoto({ file: ready.file, preview: URL.createObjectURL(ready.file) });
  };

  useEffect(() => {
    if (!editing) return;
    api.get(`/vehicles/${id}`)
      .then(({ data }) => setForm({ ...blank, ...data, regNumber: formatReg(data.regNumber), variant: data.variant || '' }))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [id, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setType = (type) => setForm((f) => ({ ...f, type, brand: options?.brands[type].includes(f.brand) ? f.brand : '' }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    if (!form.brand) return setFieldErrors({ brand: 'Choose a brand.' });
    setBusy(true);
    try {
      const payload = { type: form.type, brand: form.brand, model: form.model, variant: form.variant, year: Number(form.year), regNumber: form.regNumber, fuel: form.fuel };
      if (editing) {
        await api.patch(`/vehicles/${id}`, payload);
        navigate(`/customer/vehicles/${id}`);
      } else {
        const { data } = await api.post('/vehicles', { ...payload, km: Number(form.km), documents: docs });
        // The vehicle is saved; now its photo. If the photo fails, the vehicle page says so and lets them retry.
        let photoMsg = null;
        if (photo) {
          try {
            const fd = new FormData();
            fd.append('image', photo.file);
            await api.post(`/vehicles/${data._id}/image`, fd);
          } catch (err) {
            photoMsg = { tone: 'bad', text: `Your vehicle was added, but the photo did not upload: ${errorMessage(err)} Try again below.` };
          }
        }
        navigate(`/customer/vehicles/${data._id}`, { state: { photoMsg } });
      }
    } catch (err) {
      setError(errorMessage(err));
      const details = err.response?.data?.details;
      if (details) setFieldErrors(Object.fromEntries(details.map((d) => [d.field, d.message])));
    } finally {
      setBusy(false);
    }
  };

  const fe = (k) => fieldErrors[k] && <small className="err">{fieldErrors[k]}</small>;

  return (
    <Layout title={editing ? 'Edit vehicle' : 'Add a vehicle'}>
      {loading ? <p className="muted">Loading…</p> : (
        <form className="card form-card" onSubmit={submit} noValidate>
          <div className="seg" role="group" aria-label="Vehicle type">
            {(options?.types || ['Car', 'Bike']).map((t) => (
              <button key={t} type="button" aria-pressed={form.type === t} onClick={() => setType(t)}>{t}</button>
            ))}
          </div>

          <div className="grid2">
            <label className="field">
              <span>Brand</span>
              <select value={form.brand} onChange={set('brand')} required>
                <option value="">Choose a brand</option>
                {options?.brands[form.type].map((b) => <option key={b}>{b}</option>)}
              </select>
              {fe('brand')}
            </label>
            <label className="field"><span>Model</span><input value={form.model} onChange={set('model')} placeholder={form.type === 'Car' ? 'Creta' : 'Activa 6G'} required />{fe('model')}</label>
            <label className="field"><span>Variant (optional)</span><input value={form.variant} onChange={set('variant')} placeholder="SX" /></label>
            <label className="field"><span>Manufacturing year</span><input type="number" min="1990" max={new Date().getFullYear() + 1} value={form.year} onChange={set('year')} required />{fe('year')}</label>
            <label className="field"><span>Registration number</span><input value={form.regNumber} onChange={set('regNumber')} placeholder="KA 09 MB 4821" autoCapitalize="characters" required />{fe('regNumber')}</label>
            <label className="field">
              <span>Fuel</span>
              <select value={form.fuel} onChange={set('fuel')}>
                {(options?.fuels || ['Petrol']).map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            {!editing && (
              <label className="field"><span>Current odometer (km)</span><input type="number" min="0" inputMode="numeric" value={form.km} onChange={set('km')} placeholder="18450" required />{fe('km')}</label>
            )}
          </div>

          {!editing && (
            <fieldset className="fieldset">
              <legend>Document expiry dates (optional)</legend>
              <div className="grid3">
                {DOC_FIELDS.map(([k, label]) => (
                  <div key={k} className="field">
                    <span>{label}</span>
                    <DatePicker label={`${label} expiry`} placeholder="Not set" value={docs[k]} onChange={(d) => setDocs({ ...docs, [k]: d })} quick={docQuick(k)} clearable {...DOC_YEARS} />
                  </div>
                ))}
              </div>
              <p className="small muted">We use these to remind you before they expire.</p>
            </fieldset>
          )}

          {!editing && (
            <fieldset className="fieldset">
              <legend>Vehicle photo (optional)</legend>
              <div className="vphoto" style={{ maxWidth: 360 }}>
                {photo ? <img src={photo.preview} alt="Chosen vehicle photo" /> : <span>No photo chosen</span>}
              </div>
              <div className="row">
                <label className="btn">
                  {photo ? 'Change photo' : 'Choose photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} hidden />
                </label>
                {photo && <button type="button" className="btn" onClick={() => setPhoto(null)}>Remove</button>}
              </div>
              {photoError && <small className="err">{photoError}</small>}
              <p className="small muted">Service centers see this photo with your booking, so they can recognise your vehicle.</p>
            </fieldset>
          )}

          {error && <div className="alert bad">{error}</div>}
          <div className="row">
            <button className="btn primary" disabled={busy}>{busy ? (photo && !editing ? 'Saving and uploading photo…' : 'Saving…') : editing ? 'Save changes' : 'Add vehicle'}</button>
            <Link className="btn" to={editing ? `/customer/vehicles/${id}` : '/customer/vehicles'}>Cancel</Link>
          </div>
        </form>
      )}
    </Layout>
  );
}
