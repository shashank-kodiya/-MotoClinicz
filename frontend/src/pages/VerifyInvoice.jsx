import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { inr2 } from '../utils/booking.js';

// Public page opened by scanning the QR code on an invoice. No login needed.
export default function VerifyInvoice() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [res, setRes] = useState(null);

  useEffect(() => {
    api.get(`/meta/verify-invoice/${id}`, { params: { code: params.get('code') || '' } })
      .then(({ data }) => setRes(data))
      .catch((e) => setRes({ valid: false, message: errorMessage(e) }));
  }, [id, params]);

  return (
    <div className="auth-wrap">
      <div className="card verify-card">
        <div className="brand"><span className="brand-mark">MC</span><div><b>MotoClinicz</b><span>Invoice check</span></div></div>
        {!res ? <p className="muted">Checking…</p> : res.valid ? (
          <>
            <div className="alert good"><span className="verify-mark" aria-hidden="true">✓</span><b>This invoice is genuine.</b><span className="small">It was issued through MotoClinicz and has not been changed.</span></div>
            <dl className="kv">
              <dt>Invoice no.</dt><dd className="mono">{res.invoiceNo}</dd>
              <dt>Date</dt><dd>{new Date(res.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
              <dt>Service center</dt><dd>{res.center}</dd>
              <dt>Service</dt><dd>{res.service}</dd>
              <dt>Vehicle</dt><dd className="mono">{res.vehicle}</dd>
              <dt>Total</dt><dd><b>{inr2(res.total)}</b> <span className={`chip ${res.paid ? 'good' : 'warn'}`}>{res.paid ? 'Paid' : 'Not paid yet'}</span></dd>
            </dl>
            <p className="small muted">Compare these details with the printed invoice. If anything differs, the paper copy has been altered.</p>
          </>
        ) : (
          <div className="alert bad"><span className="verify-mark" aria-hidden="true">✗</span><b>Invoice not found.</b><span className="small">{res.message}</span></div>
        )}
        <Link className="small" to="/login">Go to MotoClinicz</Link>
      </div>
    </div>
  );
}
