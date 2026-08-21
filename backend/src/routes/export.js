// FR-10: export itinerary as PDF.

const express = require('express');
const PDFDocument = require('pdfkit');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(22).text(itinerary.title, { align: 'left' });
    doc
      .fontSize(11)
      .fillColor('#5B5750')
      .text(
        `${itinerary.start_date} – ${itinerary.end_date}  ·  ${itinerary.travellers || ''}  ·  ${itinerary.currency} ${itinerary.budget} budget`
      );
    doc.moveDown();
    doc.fillColor('#1F1B16');

    (days || []).forEach((day) => {
      doc.moveDown(0.5);
      doc.fontSize(15).fillColor('#2E5E4E').text(`Day ${day.day_number} — ${day.title || ''}`);
      if (day.weather?.summary) {
        doc.fontSize(10).fillColor('#5B5750').text(`Weather: ${day.weather.summary}, ${day.weather.temp_c}°C`);
      }
      doc.moveDown(0.2);
      (day.activities || []).forEach((a) => {
        doc
          .fontSize(11)
          .fillColor('#1F1B16')
          .text(`${a.time || ''}  ${a.name || ''}  —  ${a.cost === 0 ? 'Free' : `$${a.cost}`}`);
        if (a.description) {
          doc.fontSize(9).fillColor('#8E897F').text(a.description, { indent: 12 });
        }
      });
      if (day.notes) {
        doc.fontSize(9).fillColor('#8E897F').text(`Notes: ${day.notes}`);
      }
      doc.fontSize(10).fillColor('#1F1B16').text(`Estimated day cost: $${day.estimated_cost || 0}`, { align: 'right' });
    });

    doc.moveDown();
    doc.fontSize(12).fillColor('#1F1B16').text(`Estimated total cost: $${itinerary.estimated_cost || 0}`, { align: 'right' });

    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
