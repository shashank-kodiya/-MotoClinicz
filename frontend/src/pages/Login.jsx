import { useState } from 'react';
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth, homeFor } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';
import customerGarage from '../assets/login/customer-garage.jpg';
import centerTruck from '../assets/login/service-center-tow-truck.jpg';
import './Login.css';

function Icon({ name }) {
  const paths = {
    wrench: <><path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-2.5-2.5 6-6A4 4 0 0 1 11.3 7L9 4.7 11 3l2.4 2.3" /><path d="M3 21l6-6" /></>,
    car: <><path d="M5 17h14v-4.5l-2-5H7l-2 5V17Z" /><path d="M3 12.5h18" /><circle cx="7.5" cy="17" r="1.8" /><circle cx="16.5" cy="17" r="1.8" /></>,
    store: <><path d="M3 9.5 5 4h14l2 5.5M3 9.5h18M3 9.5V20h18V9.5M9 20v-6h6v6" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    'eye-off': <><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  };

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function Login() {
  const { login, logout, register, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [portal, setPortal] = useState('customer');
  const [authMode, setAuthMode] = useState('login');
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [centerForm, setCenterForm] = useState({ name: '', address: '', city: '', pincode: '', phone: '' });
  const [showPassword, setShowPassword] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const choosePortal = (nextPortal) => {
    setPortal(nextPortal);
    setError('');
  };

  const switchAuthMode = (nextMode) => {
    setAuthMode(nextMode);
    setError('');
    setShowPassword(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(form.email, form.password);
      const expectedRole = portal === 'customer' ? 'customer' : 'service_center';
      if (u.role !== expectedRole && u.role !== 'admin') {
        logout();
        setError(`This account belongs to ${u.role === 'customer' ? 'the Customer' : 'the Service Center'} portal. Switch portals and try again.`);
        return;
      }
      const from = location.state?.from?.pathname;
      navigate(from && from.startsWith(homeFor(u.role)) ? from : homeFor(u.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitRegistration = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const role = portal === 'customer' ? 'customer' : 'service_center';
      const payload = { ...registerForm, role, ...(role === 'service_center' ? { center: centerForm } : {}) };
      const u = await register(payload);
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vsmsLogin" data-portal={portal}>
      <div className="vsmsLogin__backdrop" aria-hidden="true">
        <img src={customerGarage} alt="" className="vsmsLogin__backdropCustomer" />
        <img src={centerTruck} alt="" className="vsmsLogin__backdropCenter" />
      </div>

      <header className="vsmsLogin__header">
        <Link className="vsmsLogin__brand" to="/login" aria-label="MotoClinicz home">
          <span className="vsmsLogin__brandMark"><Icon name="wrench" /></span>
          <span><b>MotoClinicz</b><small>Check-up. Fix-up. Gear up.</small></span>
        </Link>
        <span className="vsmsLogin__headerTag">Secure account access</span>
      </header>

      <main className="vsmsLogin__main">
        <div className="vsmsLogin__intro">
          <div>
            <span className="vsmsLogin__eyebrow">{authMode === 'login' ? 'Welcome back' : 'Get started'}</span>
            <h1>{authMode === 'login' ? 'Sign in to MotoClinicz' : 'Join MotoClinicz'}</h1>
            <p>{authMode === 'login' ? 'Choose your portal to continue to your account.' : 'Create an account for your selected portal.'}</p>
          </div>
          <div className="vsmsLogin__tabs" role="group" aria-label="Choose portal">
            <button type="button" aria-pressed={portal === 'customer'} onClick={() => choosePortal('customer')}>
              <Icon name="car" /> Customer
            </button>
            <button type="button" aria-pressed={portal === 'center'} onClick={() => choosePortal('center')}>
              <Icon name="store" /> Service Center
            </button>
          </div>
        </div>

        <section className="vsmsLogin__card" data-mode={authMode} data-portal={portal} aria-label={`${authMode === 'login' ? 'Sign in' : 'Create account'} for ${portal === 'customer' ? 'Customer' : 'Service Center'}`}>
          <form className="vsmsLogin__form" onSubmit={authMode === 'login' ? submit : submitRegistration} noValidate>
            <div className="vsmsLogin__formContents" key={authMode}>
              <div className="vsmsLogin__formHeading">
                <span className="vsmsLogin__eyebrow">{portal === 'customer' ? 'Customer portal' : 'Service center portal'}</span>
                <h2>{authMode === 'login' ? (portal === 'customer' ? 'Customer Login' : 'Service Center Login') : (portal === 'customer' ? 'Create your account' : 'Register your workshop')}</h2>
                <p>{authMode === 'login'
                  ? (portal === 'customer' ? 'Book services, track repairs, and manage your vehicle.' : 'Manage service bookings, customers, and workshop operations.')
                  : (portal === 'customer' ? 'Your vehicle services, all in one place.' : 'Set up your workshop to receive online bookings.')}</p>
              </div>

              {authMode === 'login' ? (
                <>
                  <div className="vsmsLogin__field">
                    <label htmlFor="login-email">{portal === 'customer' ? 'Email address' : 'Work email'}</label>
                    <span className="vsmsLogin__control">
                      <Icon name="mail" />
                      <input id="login-email" type="email" autoComplete="username" placeholder={portal === 'customer' ? 'you@example.com' : 'manager@yourworkshop.com'} required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </span>
                  </div>

                  <div className="vsmsLogin__field">
                    <label htmlFor="login-password">Password</label>
                    <span className="vsmsLogin__control">
                      <Icon name="lock" />
                      <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                      <button className="vsmsLogin__passwordToggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>
                        <Icon name={showPassword ? 'eye-off' : 'eye'} />
                      </button>
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="vsmsLogin__registerGrid">
                    <label className="vsmsLogin__field">
                      <span>{portal === 'customer' ? 'Full name' : 'Owner name'}</span>
                      <input autoComplete="name" required value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} />
                    </label>
                    <label className="vsmsLogin__field">
                      <span>Mobile number</span>
                      <input type="tel" autoComplete="tel" inputMode="numeric" maxLength={10} value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} />
                    </label>
                    <label className="vsmsLogin__field vsmsLogin__spanTwo">
                      <span>{portal === 'customer' ? 'Email address' : 'Work email'}</span>
                      <input type="email" autoComplete="email" required value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} />
                    </label>
                    <label className="vsmsLogin__field vsmsLogin__spanTwo">
                      <span>Password</span>
                      <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} />
                    </label>
                  </div>
                  {portal === 'center' && (
                    <fieldset className="vsmsLogin__centerFields">
                      <legend>Service center details</legend>
                      <div className="vsmsLogin__registerGrid">
                        <label className="vsmsLogin__field vsmsLogin__spanTwo">
                          <span>Center name</span>
                          <input required value={centerForm.name} onChange={(e) => setCenterForm({ ...centerForm, name: e.target.value })} />
                        </label>
                        <label className="vsmsLogin__field vsmsLogin__spanTwo">
                          <span>Address</span>
                          <input required value={centerForm.address} onChange={(e) => setCenterForm({ ...centerForm, address: e.target.value })} />
                        </label>
                        <label className="vsmsLogin__field">
                          <span>City</span>
                          <input required value={centerForm.city} onChange={(e) => setCenterForm({ ...centerForm, city: e.target.value })} />
                        </label>
                        <label className="vsmsLogin__field">
                          <span>PIN code</span>
                          <input inputMode="numeric" maxLength={6} required value={centerForm.pincode} onChange={(e) => setCenterForm({ ...centerForm, pincode: e.target.value })} />
                        </label>
                        <label className="vsmsLogin__field vsmsLogin__spanTwo">
                          <span>Center phone</span>
                          <input type="tel" autoComplete="tel" inputMode="numeric" maxLength={10} required value={centerForm.phone} onChange={(e) => setCenterForm({ ...centerForm, phone: e.target.value })} />
                        </label>
                      </div>
                    </fieldset>
                  )}
                </>
              )}

              {error && <div className="vsmsLogin__error" role="alert">{error}</div>}
              <button className="vsmsLogin__submit" type="submit" disabled={busy}>
                {busy ? (authMode === 'login' ? 'Signing in…' : 'Creating account…') : (authMode === 'login' ? `Login as ${portal === 'customer' ? 'Customer' : 'Service Center'}` : 'Create account')}
                {!busy && <Icon name="arrow" />}
              </button>
              <p className="vsmsLogin__register">
                {authMode === 'login' ? 'New here? ' : 'Already have an account? '}
                <button type="button" onClick={() => switchAuthMode(authMode === 'login' ? 'register' : 'login')}>
                  {authMode === 'login' ? 'Create an account' : 'Sign in'}
                </button>
              </p>
            </div>
          </form>

          <aside className="vsmsLogin__visual" aria-label={authMode === 'login' ? (portal === 'customer' ? 'Customer services' : 'Workshop operations') : (portal === 'customer' ? 'Customer account benefits' : 'Workshop account benefits')}>
            <img key={portal} src={portal === 'customer' ? customerGarage : centerTruck} alt={portal === 'customer' ? 'Customer at a vehicle service center' : 'Tow truck carrying a vehicle'} />
            <div className="vsmsLogin__visualShade" />
            <div className="vsmsLogin__visualCopy" key={`${portal}-${authMode}`}>
              <span className="vsmsLogin__visualTag">{authMode === 'login' ? (portal === 'customer' ? 'For vehicle owners' : 'For workshops') : 'Get started with MotoClinicz'}</span>
              <h3>{authMode === 'login'
                ? (portal === 'customer' ? 'Hand over the keys. Follow every step.' : 'Every job, booking, and bay in one place.')
                : (portal === 'customer' ? 'Your next service starts here.' : 'Bring your workshop online.')}</h3>
              <p>{authMode === 'login'
                ? (portal === 'customer' ? 'Track repairs, approve estimates, and manage service history.' : 'Coordinate bookings, technicians, and customer updates.')
                : (portal === 'customer' ? 'Create an account to book services and follow every repair.' : 'Create a center profile and start managing bookings.')}</p>
              <div className="vsmsLogin__chips">
                {(portal === 'customer' ? ['Live repair tracking', 'Online booking', 'Digital invoices'] : ['Job cards', 'Bay planning', 'Customer updates']).map((item) => <span key={item}>{item}</span>)}
              </div>
            </div>
          </aside>
        </section>

        <p className="vsmsLogin__footnote"><span aria-hidden="true">i</span> Sign in with the email and password linked to your MotoClinicz account.</p>
      </main>
    </div>
  );
}
