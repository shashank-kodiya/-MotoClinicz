import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth, homeFor } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';

const emptyCenter = { name: '', address: '', city: '', pincode: '', phone: '' };

export default function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('customer');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [center, setCenter] = useState(emptyCenter);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setC = (k) => (e) => setCenter({ ...center, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { ...form, role, ...(role === 'service_center' ? { center } : {}) };
      const u = await register(payload);
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card wide" onSubmit={submit} noValidate>
        <div className="brand"><span className="brand-mark">MC</span><div><b>MotoClinicz</b><span>Check-up. Fix-up. Gear up.</span></div></div>
        <h1>Create an account</h1>

        <div className="seg" role="group" aria-label="Account type">
          <button type="button" aria-pressed={role === 'customer'} onClick={() => setRole('customer')}>I own a vehicle</button>
          <button type="button" aria-pressed={role === 'service_center'} onClick={() => setRole('service_center')}>I run a service center</button>
        </div>

        <div className="grid2">
          <label className="field"><span>{role === 'service_center' ? 'Owner name' : 'Full name'}</span><input required value={form.name} onChange={set('name')} /></label>
          <label className="field"><span>Mobile number</span><input inputMode="numeric" maxLength={10} placeholder="9876543210" value={form.phone} onChange={set('phone')} /></label>
          <label className="field"><span>Email</span><input type="email" autoComplete="email" required value={form.email} onChange={set('email')} /></label>
          <label className="field"><span>Password</span><input type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} /><small className="muted">At least 8 characters, with a letter and a number</small></label>
        </div>

        {role === 'service_center' && (
          <fieldset className="fieldset">
            <legend>Service center details</legend>
            <div className="grid2">
              <label className="field"><span>Center name</span><input required value={center.name} onChange={setC('name')} /></label>
              <label className="field"><span>Center phone</span><input inputMode="numeric" maxLength={10} required value={center.phone} onChange={setC('phone')} /></label>
              <label className="field full"><span>Address</span><input required value={center.address} onChange={setC('address')} /></label>
              <label className="field"><span>City</span><input required value={center.city} onChange={setC('city')} /></label>
              <label className="field"><span>PIN code</span><input inputMode="numeric" maxLength={6} required value={center.pincode} onChange={setC('pincode')} /></label>
            </div>
            <p className="small muted">The platform admin checks new service centers before they appear to customers.</p>
          </fieldset>
        )}

        {error && <div className="alert bad">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <p className="small muted">Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
