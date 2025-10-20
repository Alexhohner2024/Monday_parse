const pdf = require('pdf-parse');

module.exports = async function handler(req, res) {
  // CORS headers
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
    const fullText = data.text;

    // 1. Номер полиса
    const policyMatch = fullText.match(/(\d{9})/);
    const policyNumber = policyMatch ? policyMatch[1] : null;

    // 2. ИПН
    const ipnMatch = fullText.match(/(\d{10})/);
    const ipn = ipnMatch ? ipnMatch[1] : null;

    // 3. Цена
    let price = null;
    const priceMatch = fullText.match(/(\d{1,6})\s*грн/);
    if (priceMatch) {
      price = priceMatch[1];
    }

    // 4. ФИО страхувальника
    let insuredName = null;
    const nameMatch = fullText.match(/([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)/);
    if (nameMatch) {
      insuredName = nameMatch[1];
    }

    // 5. Дата початку
    let startDate = null;
    const startDateMatch = fullText.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (startDateMatch) {
      startDate = startDateMatch[1];
    }

    // 6. Дата закінчення
    let endDate = null;
    const endDateMatch = fullText.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (endDateMatch) {
      endDate = endDateMatch[1];
    }

    // 7. Марка и модель авто
    let carModel = null;
    const carModelMatch = fullText.match(/Марка[\s\S]*?([A-ZА-ЯІЇЄҐЁ][A-ZА-ЯІЇЄҐЁ0-9\s-]+)/i);
    if (carModelMatch) {
      carModel = carModelMatch[1].trim();
    }

    // 8. Государственный номер авто
    let carNumber = null;
    const carNumberMatch = fullText.match(/([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})/);
    if (carNumberMatch) {
      carNumber = carNumberMatch[1];
    }

    const result = `${price || ''}|${ipn || ''}|${policyNumber || ''}`;

    return res.status(200).json({
      success: true,
      result: result,
      detailsCollection: {
        price: price,
        ipn: ipn,
        policy_number: policyNumber,
        insured_name: insuredName,
        start_date: startDate,
        end_date: endDate,
        car_model: carModel,
        car_number: carNumber
      }
    });
  } catch (error) {
    console.error('Error processing PDF:', error);
    return res.status(500).json({
      error: 'Failed to process PDF',
      message: error.message
    });
  }
};