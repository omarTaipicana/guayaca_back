import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

const font = fileURLToPath(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url));
const logo = fileURLToPath(new URL('../assets/guayaca-logo.png', import.meta.url));
const money = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const cutDate = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', year: 'numeric',
});
const cash = value => money.format(Number(value ?? 0));
const navy = '#0b3467';
const ink = '#24364a';
const muted = '#526479';
const margin = 42;
const numericWidth = 92;

export function collectionPdf(report, res) {
  const doc = new PDFDocument({ size: 'A4', margin, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="GUAYACA-Corte-${report.id}.pdf"`);
  doc.pipe(res);
  doc.font(font);

  const { items, summary } = report.snapshot;
  const width = doc.page.width - margin * 2;
  const tripWidth = width - numericWidth * 3;
  const bottom = doc.page.height - margin - 25;
  let y;

  function amounts(values, top, color = ink) {
    doc.fillColor(color);
    values.forEach((value, index) => {
      doc.text(value, margin + tripWidth + index * numericWidth, top, {
        width: numericWidth - 12, align: 'right', lineBreak: false,
      });
    });
  }

  function header(firstPage) {
    doc.image(logo, margin, margin, { fit: [47, 47] });
    doc.fillColor(navy).fontSize(12).text('GUAYACA TRANSPORT', margin + 60, margin + 2);
    doc.fontSize(21).text('Reporte de cobro', margin + 60, margin + 19);
    doc.fillColor(muted).fontSize(9).text(
      `Corte #${report.id}  ·  ${cutDate.format(new Date(report.cut_at))}  ·  USD`,
      margin + 60, margin + 48,
    );
    y = margin + 75;
    if (firstPage) {
      doc.fontSize(10).text(`${summary.trips} ${summary.trips === 1 ? 'viaje' : 'viajes'} en el corte`, margin, y);
      y += 23;
    }

    doc.fillColor(navy).rect(margin, y, width, 27).fill();
    doc.fillColor('#ffffff').fontSize(10).text('Viaje', margin + 12, y + 7, { lineBreak: false });
    amounts(['Flete', 'Stand by', 'Total'], y + 7, '#ffffff');
    y += 27;
  }

  header(true);
  items.forEach((trip, index) => {
    const tripCode = String(trip.code || trip.id);
    const route = [trip.origin, trip.destination].filter(Boolean).join(' → ');
    const size = { width: tripWidth - 24, height: 24, ellipsis: true };
    const rowHeight = route ? 46 : 27;
    if (y + rowHeight > bottom) {
      doc.addPage();
      header(false);
    }
    if (index % 2 === 0) doc.fillColor('#f2f6fb').rect(margin, y, width, rowHeight).fill();
    doc.fillColor(navy).fontSize(10).text(tripCode, margin + 12, y + 7, { ...size, height: 14 });
    if (route) doc.fillColor(muted).fontSize(8).text(route, margin + 12, y + 21, size);
    amounts([cash(trip.base), trip.standby ? cash(trip.standby) : '—', cash(trip.total)], y + 7);
    y += rowHeight;
  });

  if (y + 36 > bottom) {
    doc.addPage();
    header(false);
  }
  doc.fillColor('#e1edf8').rect(margin, y, width, 36).fill();
  doc.fillColor(navy).fontSize(11).text('TOTAL A PAGAR', margin + 12, y + 11, { lineBreak: false });
  amounts([cash(summary.base), cash(summary.standby), cash(summary.total)], y + 11, navy);

  const { start, count } = doc.bufferedPageRange();
  for (let index = 0; index < count; index++) {
    doc.switchToPage(start + index);
    doc.fillColor(muted).fontSize(8).text(
      `Corte #${report.id}  ·  Página ${index + 1} de ${count}`,
      margin, doc.page.height - margin - 10, { width, align: 'right', lineBreak: false },
    );
  }
  doc.end();
}
