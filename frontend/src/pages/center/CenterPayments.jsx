import { useEffect, useState } from 'react';
import Layout from '../../components/Layout.jsx';
import Notice from '../../components/Notice.jsx';
import PaymentRequests from '../../components/PaymentRequests.jsx';
import DailyPaymentSummary from '../../components/DailyPaymentSummary.jsx';
import { PAYMENT_METHODS } from '../../components/PaymentMethods.jsx';
import api, { errorMessage } from '../../api/client.js';
import { prepareUpload } from '../../utils/shrinkImage.js';
import './CenterPayments.css';

export default function CenterPayments() {
  const [form, setForm] = useState(null);
  const [qr, setQr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [qrMsg, setQrMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState('');

  const apply = (data) => {
    setForm({ acceptsUpi: !!data.acceptsUpi, upiId: data.upiId || '', payeeName: data.payeeName || '', methods: data.methods || ['cash'], payBeforePickup: !!data.payBeforePickup });
    setQr(data.upiQr?.url || null);
  };

  useEffect(() => {
    api.get('/center/payment-settings').then(({ data }) => apply(data)).catch((e) => setMsg({ tone: 'bad', text: errorMessage(e) }));
  }, []);

  const toggleMethod = (key) => setForm((f) => {
    const has = f.methods.includes(key);
    const methods = has ? f.methods.filter((m) => m !== key) : [...f.methods, key];
    // Online UPI needs UPI to be an accepted method.
    return { ...f, methods, acceptsUpi: key === 'upi' && has ? false : f.acceptsUpi };
  });

  const save = async (e) => {
    e.preventDefault();
    if (!form.methods.length) { setMsg({ tone: 'bad', text: 'Choose at least one way customers can pay.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.put('/center/payment-settings', form);
      apply(data);
      setMsg({ tone: 'good', text: form.acceptsUpi ? 'Saved. Customers see how you take payment, and can pay their bill by UPI.' : 'Saved. Customers see how you take payment at the counter.' });
    } catch (err) {
      setMsg({ tone: 'bad', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const uploadQr = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setQrBusy('upload');
    setQrMsg(null);
    try {
      const ready = await prepareUpload(file, { keepPng: true });
      if (ready.tooBig) { setQrMsg({ tone: 'bad', text: 'This image is too large. Try a smaller one.' }); return; }
      const fd = new FormData();
      fd.append('image', ready.file);
      const { data } = await api.post('/center/payment-settings/qr', fd);
      setQr(data.upiQr?.url || null);
      setQrMsg({ tone: 'good', text: 'QR uploaded. Customers see it when they pay their bill online.' });
    } catch (err) {
      setQrMsg({ tone: 'bad', text: errorMessage(err) });
    } finally {
      setQrBusy('');
    }
  };

  const removeQr = async () => {
    setQrBusy('remove');
    setQrMsg(null);
    try {
      const { data } = await api.delete('/center/payment-settings/qr');
      setQr(data.upiQr?.url || null);
      setQrMsg({ tone: 'good', text: 'QR removed. Customers see the QR made from your UPI ID instead.' });
    } catch (err) {
      setQrMsg({ tone: 'bad', text: errorMessage(err) });
    } finally {
      setQrBusy('');
    }
  };

  return (
    <Layout title="Payments" subtitle="Choose how customers can pay, take UPI payments and confirm them here.">
      <div className="center-payments">
      <DailyPaymentSummary />

      <div className="card center-payments__card">
        <h3>Online payment settings</h3>
        {!form ? <p className="muted">Loading…</p> : (
          <form className="list" onSubmit={save} noValidate>
            <fieldset className="fieldset">
              <legend>Accepted payment methods</legend>
              <p className="small muted">Customers see these on the booking, your center page and the bill.</p>
              <div className="checks">
                {PAYMENT_METHODS.map((m) => (
                  <label key={m.key} className={`check ${form.methods.includes(m.key) ? 'on' : ''}`}>
                    <input type="checkbox" checked={form.methods.includes(m.key)} onChange={() => toggleMethod(m.key)} />
                    <span aria-hidden="true">{m.icon}</span> {m.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="row">
              <input type="checkbox" checked={form.acceptsUpi} disabled={!form.methods.includes('upi')}
                onChange={(e) => setForm({ ...form, acceptsUpi: e.target.checked })} />
              <span>Let customers pay their final bill online by UPI {!form.methods.includes('upi') && <span className="muted small">(tick UPI above first)</span>}</span>
            </label>
            <div className="fgrid">
              <label className="field"><span>UPI ID</span><input value={form.upiId} disabled={!form.acceptsUpi} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="yourshop@okaxis" autoComplete="off" /></label>
              <label className="field"><span>Name shown to customers</span><input value={form.payeeName} disabled={!form.acceptsUpi} maxLength={60} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} placeholder="Kaveri Motor Works" /></label>
            </div>
            <fieldset className="fieldset">
              <legend>Vehicle release</legend>
              <label className="row">
                <input type="checkbox" checked={form.payBeforePickup} onChange={(e) => setForm({ ...form, payBeforePickup: e.target.checked })} />
                <span><b>Pay before pickup</b>: release a vehicle only after its bill is paid</span>
              </label>
              <p className="small muted">
                {form.payBeforePickup
                  ? 'The customer sees their pickup code only after paying online, or after you record their counter payment on the job card. Handover is blocked until then.'
                  : 'Off: you take the payment at the moment of handover, together with the pickup code.'}
              </p>
            </fieldset>
            <p className="small muted">Demo payments: the customer pays your UPI ID from their own app and sends you the reference number. You check your account and confirm. Cash, card and UPI at the counter still work at handover.</p>
            <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
          </form>
        )}
        <Notice msg={msg} />
      </div>

      <div className="card center-payments__card">
        <h3>Your UPI QR code</h3>
        <p className="small muted">
          Upload the QR from your GPay, PhonePe, Paytm or bank app (the one at your counter). Customers scan it to pay their bill online.
          Without it, they see a QR made from your UPI ID. JPG, PNG or WebP.
        </p>
        <div className="upi-qr-manage">
          <div className="upi-qr-box">
            {qr ? <a href={qr} target="_blank" rel="noreferrer"><img src={qr} alt="Your UPI QR code" /></a> : <span className="small muted">No QR uploaded</span>}
          </div>
          <div className="list">
            <label className={`btn primary ${qrBusy ? 'disabled' : ''}`}>
              {qrBusy === 'upload' ? 'Uploading…' : qr ? 'Replace QR' : 'Upload QR'}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!!qrBusy} onChange={uploadQr} />
            </label>
            {qr && <button type="button" className="btn ghost" onClick={removeQr} disabled={!!qrBusy}>{qrBusy === 'remove' ? 'Removing…' : 'Remove QR'}</button>}
            {form && !form.acceptsUpi && <p className="small warn-note">Online UPI is off, so customers won't see this QR yet. Turn it on above.</p>}
          </div>
        </div>
        <Notice msg={qrMsg} />
      </div>

      <div className="card center-payments__card">
        <h3>Payments waiting for you</h3>
        <PaymentRequests />
      </div>
      </div>
    </Layout>
  );
}
