import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';
import '../pages/center/CenterPortal.css';
import '../pages/customer/CustomerPortal.css';
import '../pages/admin/AdminPortal.css';

const ROLE_LABEL = { customer: 'Customer', service_center: 'Service Center', admin: 'Admin' };

// Menu for each role. Later phases add more items here.
const NAV = {
  customer: [
    { to: '/customer', label: 'Dashboard', end: true },
    { to: '/customer/vehicles', label: 'My Vehicles' },
    { to: '/customer/nearby', label: 'Find Centers' },
    { to: '/customer/book', label: 'Book Service' },
    { to: '/customer/bookings', label: 'My Bookings' },
    { to: '/customer/towing', label: 'Roadside Help' }
  ],
  service_center: [
    { to: '/center', label: 'Dashboard', end: true },
    { to: '/center/bookings', label: 'Bookings' },
    { to: '/center/jobs', label: 'Workshop' },
    { to: '/center/parts', label: 'Spare Parts' },
    { to: '/center/payments', label: 'Payments' },
    { to: '/center/towing', label: 'Towing' },
    { to: '/center/revenue', label: 'Revenue' },
    { to: '/center/feedback', label: 'Reviews' },
    { to: '/center/profile', label: 'Profile & Brands' },
    { to: '/center/services', label: 'Services & Prices' },
    { to: '/center/hours', label: 'Hours & Slots' },
    { to: '/center/mechanics', label: 'Mechanics' }
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/bookings', label: 'Bookings' },
    { to: '/admin/complaints', label: 'Complaints' }
  ]
};

export default function Layout({ title, subtitle, actions, children, className = '' }) {
  const { user, logout } = useAuth();
  return (
    <div className={['app', user?.role === 'customer' ? 'customer-portal' : '', user?.role === 'service_center' ? 'center-portal' : '', user?.role === 'admin' ? 'admin-portal' : '', className].filter(Boolean).join(' ')}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">MC</span>
          <div>
            <b>MotoClinicz</b>
            <span>{ROLE_LABEL[user?.role]}</span>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {(NAV[user?.role] || []).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="row">
          <NotificationBell />
          <span className="muted small">{user?.name}</span>
          <button className="btn" onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="page">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
