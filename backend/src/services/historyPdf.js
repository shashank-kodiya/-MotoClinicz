import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { healthLabel } from './serviceHistory.js';

// The built-in PDF fonts have no ₹ sign, so the PDF writes "Rs." (same as the invoice).
const rs = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const fmtKm = (k) => (Number.isFinite(k) ? `${Number(k).toLocaleString('en-IN')} km` : '-');

// Builds the vehicle's service history report and streams it to the response.
// h comes from buildHistory(); url is the public check link printed as a QR code.
export async function sendHistoryPdf(res, h, url) {
  const v = h.vehicle;
  const qr = await QRCode.toBuffer(url, { margin: 1, width: 220 });
  const file = `Service-history-${v.regNumber}.pdf`;

  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Service history ${v.regNumber}` } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${file}"`);
  doc.pipe(res);

  const L = 40;
  const W = doc.page.width - 80;
  const ink = '#1f2a37';
  const soft = '#5b6675';
  const line = '#d6dbe1';

  // Header
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(18).text('Service History Report', L, 40);
  doc.font('Helvetica').fontSize(9).fillColor(soft).text('MotoClinicz · Check-up. Fix-up. Gear up. · every service done through authorised centers on the platform', L, 62);
  doc.font('Helvetica').fontSize(9).fillColor(soft)
    .text(`Report date ${fmtDate(h.generatedAt)}`, 380, 44, { width: W - 340, align: 'right' })
    .text(`Current reading ${fmtKm(v.km)}`, { width: W - 340, align: 'right' });
  doc.moveTo(L, 82).lineTo(L + W, 82).strokeColor(line).stroke();

  // Vehicle
  doc.font('Helvetica-Bold').fontSize(9).fillColor(soft).text('VEHICLE', L, 92).text('SUMMARY', 320, 92);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text(`${v.brand} ${v.model}${v.variant ? ` ${v.variant}` : ''}`, L, 106, { width: 260 });
  doc.font('Helvetica').fontSize(10).fillColor(ink)
    .text(`${v.year} · ${v.fuel} · ${v.type}`, L, 124)
    .text(`Reg. ${v.regNumber}`, L, 138);
  const last = h.lastService;
  doc.text(`Services on record: ${h.services.length}`, 320, 106)
    .text(last ? `Last service: ${fmtDate(last.date)}${Number.isFinite(last.km) ? ` at ${fmtKm(last.km)}` : ''}` : 'No completed services yet', 320, 120, { width: W - 280 })
    .text(`Total spent: ${rs(h.totalSpent)}`, 320, 134);
  doc.fillColor(h.odometerConsistent ? '#1a7f4b' : '#a15c00')
    .text(h.odometerConsistent ? 'Odometer readings consistent' : 'Odometer reading went down between services - check with the seller', 320, 148, { width: W - 280 });

  // Services table
  const cols = [
    { h: '#', w: 20, a: 'left' }, { h: 'Date', w: 66, a: 'left' }, { h: 'Odometer', w: 66, a: 'right' },
    { h: 'Service center', w: 120, a: 'left' }, { h: 'Work done', w: W - 342, a: 'left' }, { h: 'Amount', w: 70, a: 'right' }
  ];
  let y = 180;
  const row = (cells, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(ink);
    const hgt = Math.max(...cells.map((c, i) => doc.heightOfString(String(c), { width: cols[i].w - 4 })));
    if (y + hgt > 760) { doc.addPage(); y = 40; if (!bold) header(); }
    let x = L;
    cells.forEach((c, i) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(ink).text(String(c), x + 2, y, { width: cols[i].w - 4, align: cols[i].a }); x += cols[i].w; });
    y += hgt + 8;
  };
  const header = () => { doc.rect(L, y - 5, W, 20).fill('#eef1f4'); row(cols.map((c) => c.h), true); };
  header();
  if (!h.services.length) {
    doc.font('Helvetica').fontSize(10).fillColor(soft).text('No completed services on the platform yet.', L + 2, y);
    y += 20;
  }
  h.services.forEach((s, i) => {
    const work = [s.service, ...s.repairs, ...(s.parts.length ? [`Parts: ${s.parts.join(', ')}`] : [])].join('\n');
    row([i + 1, fmtDate(s.date), fmtKm(s.km), s.center, work, s.total != null ? rs(s.total) : '-']);
    doc.moveTo(L, y - 4).lineTo(L + W, y - 4).strokeColor('#eef1f4').stroke();
  });

  // Condition at the last inspection, and documents
  if (y > 640) { doc.addPage(); y = 40; }
  y += 8;
  if (h.latestHealth) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(soft).text(`CONDITION AT LAST INSPECTION (${fmtDate(h.latestHealth.date)})`, L, y);
    y += 14;
    const parts = [['Engine', 'engine'], ['Brakes', 'brakes'], ['Tyres', 'tyres'], ['Battery', 'battery'], ['Engine oil', 'engineOil']];
    doc.font('Helvetica').fontSize(10).fillColor(ink)
      .text(parts.map(([label, k]) => `${label}: ${healthLabel(h.latestHealth.items?.[k])}`).join('   ·   '), L, y, { width: W });
    y += 24;
  }
  const d = h.documents;
  if (d.insuranceExpiry || d.pucExpiry) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(soft).text('DOCUMENTS (as entered by the owner)', L, y);
    y += 14;
    doc.font('Helvetica').fontSize(10).fillColor(ink).text([
      d.insuranceExpiry ? `Insurance valid till ${fmtDate(d.insuranceExpiry)}` : null,
      d.pucExpiry ? `PUC valid till ${fmtDate(d.pucExpiry)}` : null
    ].filter(Boolean).join('   ·   '), L, y, { width: W });
    y += 24;
  }

  // QR code to check the report against the live record
  if (y > 680) { doc.addPage(); y = 40; }
  const qy = y + 10;
  doc.image(qr, L, qy, { width: 96 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(ink).text('Scan to verify this report', L + 108, qy + 18);
  doc.font('Helvetica').fontSize(8).fillColor(soft)
    .text('The QR opens our website and shows the live service record of this vehicle. If the services, dates or km on this paper differ from the website, the paper has been changed.', L + 108, qy + 32, { width: 300 })
    .text(url, L + 108, qy + 70, { width: 300, link: url, underline: true });

  doc.fontSize(8).fillColor(soft).text('Services are recorded by the service centers when the vehicle is collected. Owner name and phone are not shown.', L, 790, { width: W, align: 'center' });
  doc.end();
}
