import { useEffect, useState } from 'react';
import Layout from '../../components/Layout.jsx';
import Notice from '../../components/Notice.jsx';
import MapView from '../../components/MapView.jsx';
import useCenterProfile from '../../hooks/useCenterProfile.js';
import useVehicleOptions from '../../hooks/useVehicleOptions.js';
import { errorMessage } from '../../api/client.js';
import { prepareUpload } from '../../utils/shrinkImage.js';
import { mapsEnabled } from '../../hooks/useGoogleMaps.js';

const FIELDS = ['name', 'description', 'address', 'city', 'pincode', 'phone', 'gstin'];

export default function CenterProfile() {
  const { center, error, save } = useCenterProfile();
  const options = useVehicleOptions();
  const [form, setForm] = useState(null);
  const [brands, setBrands] = useState({ Car: [], Bike: [] });
  const [msg, setMsg] = useState(null);
  const [brandMsg, setBrandMsg] = useState(null);
  const [locMsg, setLocMsg] = useState(null);
  const [locBusy, setLocBusy] = useState('');
  const [choosingLocation, setChoosingLocation] = useState(false);
  const [pickedLocation, setPickedLocation] = useState(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoBusy, setPhotoBusy] = useState('');
  const [photoMsg, setPhotoMsg] = useState(null);

  useEffect(() => {
    if (!center) return;
    setForm(Object.fromEntries(FIELDS.map((f) => [f, center[f] || ''])));
    setBrands({ Car: center.brands?.Car || [], Bike: center.brands?.Bike || [] });
  }, [center]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await save('patch', '/center/profile', form);
      setMsg({ tone: 'good', text: 'Profile saved.' });
    } catch (err) {
      setMsg({ tone: 'bad', text: errorMessage(err) });
    }
  };

  const toggle = (type, brand) =>
    setBrands((b) => ({ ...b, [type]: b[type].includes(brand) ? b[type].filter((x) => x !== brand) : [...b[type], brand] }));

  const saveBrands = async () => {
    setBrandMsg(null);
    try {
      await save('put', '/center/brands', brands);
      setBrandMsg({ tone: 'good', text: 'Brands saved.' });
    } catch (err) {
      setBrandMsg({ tone: 'bad', text: errorMessage(err) });
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Phase 9: where the center is on the map
  const hasPoint = Number.isFinite(center?.location?.lat) && Number.isFinite(center?.location?.lng);
  const locFail = (err) => setLocMsg({ tone: 'bad', text: errorMessage(err) });
  const useDevice = () => {
    setLocMsg(null);
    if (!('geolocation' in navigator)) return setLocMsg({ tone: 'bad', text: 'This browser cannot share your location.' });
    setLocBusy('device');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await save('put', '/center/location', { lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
          setLocMsg({ tone: 'good', text: 'Location saved. Check the pin is at your workshop (use the Google Maps link). If you are not at the shop right now, this will be wrong.' });
        } catch (err) { locFail(err); } finally { setLocBusy(''); }
      },
      (err) => {
        setLocBusy('');
        setLocMsg({ tone: 'bad', text: err.code === 1 ? 'Location permission was blocked. Allow it in the address bar and try again.' : 'Could not find your location.' });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };
  const beginMapSelection = () => {
    setPickedLocation(hasPoint ? { lat: center.location.lat, lng: center.location.lng } : null);
    setChoosingLocation(true);
    setLocMsg(null);
  };
  const saveMapSelection = async () => {
    if (!pickedLocation) {
      setLocMsg({ tone: 'bad', text: 'Click the map to place the pin at your workshop first.' });
      return;
    }
    setLocMsg(null);
    setLocBusy('map');
    try {
      await save('put', '/center/location', {
        lat: Number(pickedLocation.lat.toFixed(6)),
        lng: Number(pickedLocation.lng.toFixed(6)),
        source: 'map'
      });
      setChoosingLocation(false);
      setLocMsg({ tone: 'good', text: 'Map location saved. Check that the pin is at your workshop.' });
    } catch (err) { locFail(err); } finally { setLocBusy(''); }
  };
  // Showroom photos customers see when they search
  const photos = center?.photos || [];
  const photoAction = async (busy, run, text) => {
    setPhotoMsg(null);
    setPhotoBusy(busy);
    try { await run(); setPhotoMsg({ tone: 'good', text }); return true; } catch (err) { setPhotoMsg({ tone: 'bad', text: errorMessage(err) }); return false; } finally { setPhotoBusy(''); }
  };
  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ready = await prepareUpload(file);
    if (ready.tooBig) { setPhotoMsg({ tone: 'bad', text: 'This photo is too large. Try a smaller one.' }); return; }
    const fd = new FormData();
    fd.append('image', ready.file);
    fd.append('caption', photoCaption);
    photoAction('upload', () => save('post', '/center/photos', fd), 'Photo added. Customers will see it on your listing.')
      .then((ok) => ok && setPhotoCaption(''));
  };

  const removeLocation = async () => {
    setLocMsg(null);
    try { await save('delete', '/center/location'); setLocMsg({ tone: 'good', text: 'Location removed.' }); } catch (err) { locFail(err); }
  };

  return (
    <Layout title="Profile & Brands" subtitle="Customers see this information and search by the brands you service.">
      {error && <div className="alert bad">{error}</div>}
      {!form ? <p className="muted">Loading…</p> : (
        <>
          <form className="card form-card" onSubmit={saveProfile} noValidate>
            <h3>Center details</h3>
            <div className="grid2">
              <label className="field"><span>Center name</span><input value={form.name} onChange={set('name')} /></label>
              <label className="field"><span>Phone</span><input inputMode="numeric" maxLength={10} value={form.phone} onChange={set('phone')} /></label>
              <label className="field full"><span>Address</span><input value={form.address} onChange={set('address')} /></label>
              <label className="field"><span>City</span><input value={form.city} onChange={set('city')} /></label>
              <label className="field"><span>PIN code</span><input inputMode="numeric" maxLength={6} value={form.pincode} onChange={set('pincode')} /></label>
              <label className="field"><span>GSTIN (optional, printed on invoices)</span><input maxLength={15} value={form.gstin} onChange={set('gstin')} placeholder="29ABCDE1234F1Z5" style={{ textTransform: 'uppercase' }} /></label>
              <label className="field full"><span>About your center (optional)</span><textarea rows={3} maxLength={500} value={form.description} onChange={set('description')} placeholder="Multi-brand workshop since 2009. Genuine parts, pick-up on request." /></label>
            </div>
            <div className="row"><button className="btn primary">Save details</button></div>
            <Notice msg={msg} />
          </form>

          <div className="card">
            <div className="row between">
              <h3>Showroom photos</h3>
              <span className="small muted">{photos.length} / 10</span>
            </div>
            <p className="small muted">
              Customers see these on your listing when they search for a service center, like photos on Google.
              Add your showroom front, service bays, waiting area and team. The cover photo is shown first. JPG, PNG or WebP. Large photos are made smaller before uploading.
            </p>
            {photos.length > 0 ? (
              <div className="photo-manage">
                {photos.map((p) => (
                  <figure key={p._id}>
                    <div className="thumb">
                      <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.caption || 'Showroom photo'} loading="lazy" /></a>
                      {p.isCover && <span className="chip good">Cover</span>}
                    </div>
                    <figcaption>
                      {p.caption && <span>{p.caption}</span>}
                      {!p.isCover && (
                        <button type="button" className="btn sm" disabled={!!photoBusy}
                          onClick={() => photoAction(`cover-${p._id}`, () => save('patch', `/center/photos/${p._id}/cover`), 'Cover photo changed.')}>
                          Make cover
                        </button>
                      )}
                      <button type="button" className="btn ghost sm" disabled={!!photoBusy}
                        onClick={() => photoAction(`del-${p._id}`, () => save('delete', `/center/photos/${p._id}`), 'Photo removed.')}>
                        {photoBusy === `del-${p._id}` ? 'Removing…' : 'Remove'}
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="empty small">No photos yet. Listings with photos get more bookings.</div>
            )}
            {photos.length < 10 && (
              <div className="row align-end">
                <label className="field grow"><span>Caption (optional)</span>
                  <input maxLength={120} value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="Showroom front, Kadri Road" />
                </label>
                <label className={`btn primary ${photoBusy ? 'disabled' : ''}`}>
                  {photoBusy === 'upload' ? 'Uploading…' : 'Upload photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!!photoBusy} onChange={uploadPhoto} />
                </label>
              </div>
            )}
            <Notice msg={photoMsg} />
          </div>

          <div className="card">
            <div className="row between">
              <h3>Location on the map</h3>
              {hasPoint ? <span className="chip good">Set</span> : <span className="chip warn">Not set</span>}
            </div>
            <p className="small muted">
              {hasPoint
                ? <>Customers see how far you are from them and find you on the map. Position: {center.location.lat.toFixed(5)}, {center.location.lng.toFixed(5)} ({center.location.source === 'address' ? 'found from your address' : center.location.source === 'seed' ? 'demo data' : center.location.source === 'map' ? 'chosen on the map' : 'from this device'}). <a href={`https://www.google.com/maps?q=${center.location.lat},${center.location.lng}`} target="_blank" rel="noreferrer">Check it on Google Maps</a>.</>
                : 'Without a location, customers cannot see your distance or find you on the map. Stand at your workshop and use your current location, or choose it on the map.'}
            </p>
            {hasPoint && !choosingLocation && <MapView markers={[{ id: 'me', lat: center.location.lat, lng: center.location.lng, title: center.name, tone: 'center' }]} height={220} />}
            <div className="row">
              <button className="btn primary" onClick={useDevice} disabled={locBusy}>{locBusy === 'device' ? 'Finding you…' : 'Use my current location'}</button>
              <button className="btn" onClick={beginMapSelection} disabled={locBusy || choosingLocation || !mapsEnabled}>Choose location on map</button>
              {hasPoint && <button className="btn ghost" onClick={removeLocation} disabled={locBusy}>Remove</button>}
            </div>
            {!mapsEnabled && <p className="small muted">Choosing a pin needs VITE_GOOGLE_MAPS_KEY in frontend/.env (restart the dev server after adding it).</p>}
            {choosingLocation && (
              <>
                <p className="small muted">
                  Zoom in and click the map to place the pin at your workshop. Click again to move it.
                  {pickedLocation && <> Selected: {pickedLocation.lat.toFixed(5)}, {pickedLocation.lng.toFixed(5)}</>}
                </p>
                <MapView
                  markers={pickedLocation ? [{ id: 'picked', ...pickedLocation, title: 'Selected workshop location', tone: 'picked' }] : []}
                  onMapClick={setPickedLocation}
                  height={360}
                />
                <div className="row">
                  <button className="btn primary" onClick={saveMapSelection} disabled={locBusy}>{locBusy === 'map' ? 'Saving location…' : 'Save selected location'}</button>
                  <button className="btn" onClick={() => setChoosingLocation(false)} disabled={locBusy}>Cancel</button>
                </div>
              </>
            )}
            <Notice msg={locMsg} />
          </div>

          <div className="card">
            <div className="row between">
              <h3>Brands you service</h3>
              <span className="small muted">{brands.Car.length} car · {brands.Bike.length} bike</span>
            </div>
            <p className="small muted">A customer only sees your center when it services their vehicle's brand.</p>
            {['Car', 'Bike'].map((type) => (
              <fieldset key={type} className="fieldset">
                <legend>{type} brands</legend>
                <div className="checks">
                  {options?.brands[type].map((b) => (
                    <label key={b} className={`check ${brands[type].includes(b) ? 'on' : ''}`}>
                      <input type="checkbox" checked={brands[type].includes(b)} onChange={() => toggle(type, b)} />
                      {b}
                    </label>
                  ))}
                </div>
                <div className="row">
                  <button type="button" className="btn sm" onClick={() => setBrands((x) => ({ ...x, [type]: [...options.brands[type]] }))}>Select all</button>
                  <button type="button" className="btn sm" onClick={() => setBrands((x) => ({ ...x, [type]: [] }))}>Clear</button>
                </div>
              </fieldset>
            ))}
            <div className="row"><button className="btn primary" onClick={saveBrands}>Save brands</button></div>
            <Notice msg={brandMsg} />
          </div>
        </>
      )}
    </Layout>
  );
}
