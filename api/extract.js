const pdf = require('pdf-parse');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pdfData } = req.body;
    if (!pdfData) {
      return res.status(400).json({ error: 'PDF data required' });
    }

    const pdfBuffer = Buffer.from(pdfData, 'base64');
    const data = await pdf(pdfBuffer);
    const text = data.text;

    // Simple extraction
    const policyNumber = text.match(/(\d{9})/)?.[1] || null;
    const ipn = text.match(/(\d{10})/)?.[1] || null;
    const price = text.match(/(\d+)\s*грн/)?.[1] || null;
    const startDate = text.match(/(\d{2}\.\d{2}\.\d{4})/)?.[1] || null;
    const endDate = text.match(/(\d{2}\.\d{2}\.\d{4})/)?.[1] || null;
    const carNumber = text.match(/([А-Я]{2}\d{4}[А-Я]{2})/)?.[1] || null;

    const nameMatch = text.match(/([А-Я][а-я]+\s+[А-Я][а-я]+\s+[А-Я][а-я]+)/);
    const insuredName = nameMatch ? nameMatch[1] : null;

    const carMatch = text.match(/Марка[:\s]*([A-ZА-Я\s]+)/i);
    const carModel = carMatch ? carMatch[1].trim() : null;

    const result = `${price || ''}|${ipn || ''}|${policyNumber || ''}`;

    return res.status(200).json({
      success: true,
      result,
      detailsCollection: {
        price,
        ipn,
        policy_number: policyNumber,
        insured_name: insuredName,
        start_date: startDate,
        end_date: endDate,
        car_model: carModel,
        car_number: carNumber
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to process PDF' });
  }
};