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
    // Simple test response without PDF processing
    const result = 'test|2761800831|228754541';

    return res.status(200).json({
      success: true,
      result,
      detailsCollection: {
        price: '2761',
        ipn: '2761800831',
        policy_number: '228754541',
        insured_name: 'Тест Тестович Тестович',
        start_date: '20.10.2024',
        end_date: '23.10.2025',
        car_model: 'Mitsubishi Lancer',
        car_number: 'ВН5211НІ'
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to process request' });
  }
};