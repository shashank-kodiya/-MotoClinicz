// Email through Brevo's HTTP API (no extra package: Node 20 has fetch built in).
// Without BREVO_API_KEY nothing is sent and the app works exactly the same, so email is optional.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const emailReady = () => !!process.env.BREVO_API_KEY && !!process.env.MAIL_FROM_EMAIL;

export async function sendEmail({ to, name, subject, text, link }) {
  if (!emailReady()) return { skipped: true };
  const base = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();
  const button = link ? `<p><a href="${esc(base + link)}" style="background:#0b6b4f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open in MotoClinicz</a></p>` : '';
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: process.env.MAIL_FROM_NAME || 'MotoClinicz', email: process.env.MAIL_FROM_EMAIL },
        to: [{ email: to, name }],
        subject,
        htmlContent: `<div style="font-family:Arial,sans-serif;max-width:520px"><h3>${esc(subject)}</h3><p>Hi ${esc(name)},</p><p>${esc(text)}</p>${button}<p style="color:#777;font-size:12px">You get this because email updates are on in your MotoClinicz notification settings.</p></div>`
      })
    });
    if (!res.ok) {
      console.warn(`Email not sent (Brevo ${res.status}): ${(await res.text()).slice(0, 200)}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.warn(`Email not sent: ${err.message}`); // an email problem must never break the app
    return { sent: false };
  }
}
