import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout.jsx';
import MapView from '../../components/MapView.jsx';
import DirectionsBar, { useCenterRoute } from '../../components/DirectionsBar.jsx';
import { Stars } from '../../components/Stars.jsx';
import api, { errorMessage } from '../../api/client.js';
import useMyLocation from '../../hooks/useMyLocation.js';

export default function FindCenters() {
  const { loc, asking, error: locError, ask, clear } = useMyLocation();
  const [radius, setRadius] = useState(25);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState(null); // { available, places, message }
  const [othersError, setOthersError] = useState('');

  useEffect(() => {
    setError('');
    api.get('/maps/centers', { params: { ...(loc ? { lat: loc.lat, lng: loc.lng, radiusKm: radius } : {}) } })
      .then(({ data: d }) => setData(d)).catch((e) => setError(errorMessage(e)));
  }, [loc, radius]);

  useEffect(() => {
    if (!showOthers || !loc) { setOthers(null); return; }
    setOthersError('');
    api.get('/maps/places', { params: { lat: loc.lat, lng: loc.lng, radiusKm: Math.min(radius, 10) } })
      .then(({ data: d }) => setOthers(d)).catch((e) => setOthersError(errorMessage(e)));
  }, [showOthers, loc, radius]);

  const centers = useMemo(() => data?.centers || [], [data]);
  const markers = useMemo(() => [
    ...centers.map((c, i) => ({ id: c._id, lat: c.lat, lng: c.lng, title: c.name, label: i + 1, tone: 'center' })),
    ...(others?.places || []).map((p) => ({ id: `p:${p.placeId}`, lat: p.lat, lng: p.lng, title: p.name, tone: 'place' }))
  ], [centers, others]);

  const select = useCallback((id) => {
    setSelected(id);
    document.getElementById(`c-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Clicking a center in the list: show the route to it on the map (asking for the customer's location if needed).
  const showDirections = useCallback((id) => {
    setSelected(id);
    document.getElementById('find-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!loc && !asking) ask();
  }, [loc, asking, ask]);

  const selectedCenter = useMemo(() => centers.find((c) => c._id === selected) || null, [centers, selected]);

  // Road route to the selected center (path, distance and time), drawn on the map like Google Maps.
  const { data: routeData, route: routeToSelected } = useCenterRoute(selectedCenter, loc);

  return (
    <Layout title="Find centers" subtitle="Verified service centers on the map. Share your location to see how far each one is.">
      <div className="card">
        <div className="row between">
          <div className="row">
            <button className="btn primary" onClick={ask} disabled={asking}>{asking ? 'Finding you…' : loc ? 'Update my location' : 'Use my location'}</button>
            {loc && <button className="btn" onClick={clear}>Clear</button>}
            {loc && (
              <label className="field inline"><span>Within</span>
                <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                  {[5, 10, 25, 50, 100, 200, 300].map((r) => <option key={r} value={r}>{r} km</option>)}
                </select>
              </label>
            )}
          </div>
          {loc && <label className="row"><input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} /> <span className="small">Also show other garages nearby (Google)</span></label>}
        </div>
        {locError && <div className="alert warn">{locError}</div>}
        {error && <div className="alert bad">{error}</div>}
        <p className="small muted">Your location is used only to work out distances in this browser tab. It is not saved.</p>
      </div>

      <div id="find-map" className="directions-wrap">
        <DirectionsBar center={selectedCenter} from={loc} data={routeData} asking={asking} onAsk={ask} onClose={() => setSelected(null)} />
        <MapView markers={markers} user={loc} selectedId={selected} onSelect={select} route={routeToSelected} />
      </div>

      {data && centers.length === 0 && (
        <div className="empty">{loc ? `No verified center with a map location within ${radius} km.` : 'No verified center has set its map location yet.'}</div>
      )}

      <div className="list">
        {centers.map((c, i) => (
          <div key={c._id} id={`c-${c._id}`} className={`card result ${selected === c._id ? 'sel' : ''}`} onClick={() => showDirections(c._id)} style={{ cursor: 'pointer' }}>
            <div className="row between">
              <div>
                <h3><span className="num-dot">{i + 1}</span> {c.name}</h3>
                <div className="small"><Stars value={c.ratingAvg} count={c.ratingCount} /></div>
                <div className="small muted">{c.address}, {c.city} {c.pincode} · {c.phone}</div>
                {c.description && <div className="small">{c.description}</div>}
              </div>
              {c.distanceKm != null && <div className="price"><b>{c.distanceKm} km</b><span className="small muted">straight line</span></div>}
            </div>
            <div className="row">
              <Link className="btn sm" to={`/customer/centers/${c._id}`} onClick={(e) => e.stopPropagation()}>More details</Link>
              <button type="button" className="btn sm" onClick={(e) => { e.stopPropagation(); showDirections(c._id); }}>Show directions</button>
              <Link className="btn primary sm" to="/customer/book" onClick={(e) => e.stopPropagation()}>Book a service</Link>
            </div>
          </div>
        ))}
      </div>

      {showOthers && (
        <div className="card">
          <h3>Other garages nearby</h3>
          <p className="small muted">From Google Places. These are not on MotoClinicz, so you cannot book them here.</p>
          {othersError && <div className="alert bad">{othersError}</div>}
          {others && !others.available && <p className="small muted">{others.message}</p>}
          {others?.available && others.places.length === 0 && <p className="small muted">No other garages found in this area.</p>}
          <ul className="plain">
            {(others?.places || []).map((p) => (
              <li key={p.placeId} className="row between small">
                <span><b>{p.name}</b><br /><span className="muted">{p.address}</span>{p.rating ? <> · ★ {p.rating} ({p.ratings})</> : null}{p.openNow != null && <> · <span className={`chip ${p.openNow ? 'good' : 'warn'}`}>{p.openNow ? 'Open now' : 'Closed now'}</span></>}</span>
                <span className="row"><b>{p.distanceKm} km</b>{p.url && <a className="btn ghost sm" href={p.url} target="_blank" rel="noreferrer">Google Maps</a>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Layout>
  );
}
