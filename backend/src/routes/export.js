const express = require('express');
const PDFDocument = require('pdfkit');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Tight, deliberate palette — one accent, one ink, one muted grey.
// No other colors are used anywhere in the document.
const INK = '#22201B';
const MUTED = '#7A756B';
const ACCENT = '#2E5E4E';
const ACCENT_TINT = '#F1F5F3';
const LINE = '#DEDAD0';
const BRAND = 'WanderAI';

router.get('/itineraries/:id/pdf', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: itinerary, error: itErr } = await req.supabase.from('itineraries').select('*').eq('id', id).single();
    if (itErr || !itinerary) return res.status(404).json({ error: 'Itinerary not found.' });

    const { data: days, error: daysErr } = await req.supabase
      .from('itinerary_days')
      .select('*')
      .eq('itinerary_id', id)
      .order('day_number', { ascending: true });
    if (daysErr) throw daysErr;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${itinerary.destination}-itinerary.pdf"`);

    const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 90, bottom: 70, left: 50, right: 50 } });
    doc.pipe(res);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const generatedOn = new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });

    const colTime = 55;
    const colCost = 65;
    const colActivity = pageWidth - colTime - colCost;
    const cellPad = 6;

    function ensureSpace(minHeight) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - minHeight) {
        doc.addPage();
      }
    }

    function drawTableHeader(x, y) {
      doc.rect(x, y, pageWidth, 20).fill(ACCENT);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
      doc.text('Time', x + cellPad, y + 6, { width: colTime - cellPad });
      doc.text('Activity', x + colTime + cellPad, y + 6, { width: colActivity - cellPad * 2 });
      doc.text('Cost', x + colTime + colActivity, y + 6, { width: colCost - cellPad, align: 'right' });
      return y + 20;
    }

    function drawActivityRow(a, x, y, rowIndex) {
      const nameText = a.name || '';
      const descText = a.description || '';
      const costLabel = a.cost === 0 ? 'Free' : `$${a.cost}`;

      doc.font('Helvetica-Bold').fontSize(9.5);
      const nameHeight = doc.heightOfString(nameText, { width: colActivity - cellPad * 2 });
      doc.font('Helvetica').fontSize(8);
      const descHeight = descText ? doc.heightOfString(descText, { width: colActivity - cellPad * 2 }) : 0;
      const rowHeight = cellPad * 2 + nameHeight + (descText ? descHeight + 3 : 0);

      // Subtle alternating row tint using the single accent tint —
      // no extra colors introduced.
      if (rowIndex % 2 === 1) {
        doc.rect(x, y, pageWidth, rowHeight).fill(ACCENT_TINT);
      }

      doc.rect(x, y, colTime, rowHeight).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.rect(x + colTime, y, colActivity, rowHeight).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.rect(x + colTime + colActivity, y, colCost, rowHeight).strokeColor(LINE).lineWidth(0.5).stroke();

      doc.font('Helvetica').fontSize(9).fillColor(MUTED);
      doc.text(a.time || '', x + cellPad, y + cellPad, { width: colTime - cellPad });

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK);
      doc.text(nameText, x + colTime + cellPad, y + cellPad, { width: colActivity - cellPad * 2 });
      if (descText) {
        doc.font('Helvetica').fontSize(8).fillColor(MUTED);
        doc.text(descText, x + colTime + cellPad, y + cellPad + nameHeight + 3, { width: colActivity - cellPad * 2 });
      }

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK);
      doc.text(costLabel, x + colTime + colActivity + cellPad / 2, y + cellPad, { width: colCost - cellPad, align: 'right' });

      return y + rowHeight;
    }

    // ---- Title block ----
    doc.fontSize(22).fillColor(INK).font('Helvetica-Bold').text(itinerary.title, { align: 'left' });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(MUTED)
      .text(
        `${itinerary.start_date} to ${itinerary.end_date}   |   ${itinerary.travellers || 'Solo'}   |   Budget: ${itinerary.currency || 'AUD'} ${itinerary.budget}`
      );
    doc.moveDown(0.6);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).strokeColor(LINE).lineWidth(1).stroke();
    doc.moveDown(1);

    // ---- Days as tables ----
    (days || []).forEach((day, dayIdx) => {
      ensureSpace(90);
      if (dayIdx > 0) doc.moveDown(0.8);

      const x = doc.page.margins.left;

      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor(INK)
        .text(`Day ${day.day_number}  -  ${day.title || ''}`, x, doc.y);

      if (day.weather?.summary) {
        doc
          .fontSize(8.5)
          .font('Helvetica-Oblique')
          .fillColor(MUTED)
          .text(`Weather: ${day.weather.summary}, ${day.weather.temp_c}\u00B0C`, x, doc.y + 2);
      }
      doc.moveDown(0.4);

      let y = doc.y;
      ensureSpace(30);
      y = doc.y;
      y = drawTableHeader(x, y);

      (day.activities || []).forEach((a, i) => {
        doc.font('Helvetica-Bold').fontSize(9.5);
        const estNameHeight = doc.heightOfString(a.name || '', { width: colActivity - cellPad * 2 });
        doc.font('Helvetica').fontSize(8);
        const estDescHeight = a.description ? doc.heightOfString(a.description, { width: colActivity - cellPad * 2 }) : 0;
        const estRowHeight = cellPad * 2 + estNameHeight + (a.description ? estDescHeight + 3 : 0);

        if (y > doc.page.height - doc.page.margins.bottom - estRowHeight) {
          doc.addPage();
          y = doc.page.margins.top;
          y = drawTableHeader(x, y);
        }
        y = drawActivityRow(a, x, y, i);
      });

      doc.y = y + 6;

      if (day.notes) {
        ensureSpace(20);
        doc.fontSize(8.5).font('Helvetica-Oblique').fillColor(MUTED).text(`Note: ${day.notes}`, x, doc.y);
        doc.moveDown(0.3);
      }

      ensureSpace(20);
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(INK)
        .text(`Estimated day total: $${day.estimated_cost || 0}`, x, doc.y, { width: pageWidth, align: 'right' });
    });

    // ---- Total ----
    ensureSpace(40);
    doc.moveDown(1);
    doc.rect(doc.page.margins.left, doc.y, pageWidth, 32).fill(ACCENT_TINT);
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor(ACCENT)
      .text(`Estimated total cost: ${itinerary.currency || 'AUD'} $${itinerary.estimated_cost || 0}`, doc.page.margins.left + 10, doc.y + 9, {
        width: pageWidth - 20,
        align: 'right',
      });

    // ---- Header + footer on every page ----
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);

      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(ACCENT)
        .text(BRAND, doc.page.margins.left, 30, { width: pageWidth / 2, align: 'left' });
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(MUTED)
        .text(`Generated ${generatedOn}`, doc.page.margins.left, 33, { width: pageWidth, align: 'right' });
      doc
        .moveTo(doc.page.margins.left, 50)
        .lineTo(doc.page.margins.left + pageWidth, 50)
        .strokeColor(LINE)
        .lineWidth(0.75)
        .stroke();

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(MUTED)
        .text(`Page ${i + 1} of ${pageCount}`, doc.page.margins.left, doc.page.height - doc.page.margins.bottom + 20, {
          width: pageWidth,
          align: 'center',
        });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;