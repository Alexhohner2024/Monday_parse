const pdf = require('pdf-parse');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
    const price = text.match(/(\d{1,6})\s*грн/)?.[1] || null;
    const insuredName = text.match(/([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)/)?.[1] || null;
    const startDate = text.match(/(\d{2}\.\d{2}\.\d{4})/)?.[1] || null;
    const endDate = text.match(/(\d{2}\.\d{2}\.\d{4})/)?.[1] || null;
    const carModel = text.match(/Марка[\s\S]*?([A-ZА-ЯІЇЄҐЁ][A-ZА-ЯІЇЄҐЁ0-9\s-]+)/i)?.[1]?.trim() || null;
    const carNumber = text.match(/([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})/)?.[1] || null;

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
    console.error('Error:', error.message);
    return res.status(500).json({ error: 'Failed to process PDF' });
  }
};