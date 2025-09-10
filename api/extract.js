const pdf = require('pdf-parse');

export default async function handler(req, res) {
  // Разрешаем только POST запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Получаем PDF данные из запроса
    const { pdfData } = req.body;
    
    if (!pdfData) {
      return res.status(400).json({ error: 'PDF data required' });
    }

    // Конвертируем base64 в buffer
    const pdfBuffer = Buffer.from(pdfData, 'base64');
    
    // Извлекаем текст из PDF
    const data = await pdf(pdfBuffer);
    const fullText = data.text;

    // 1. Номер полиса - ищем везде, где есть 9 цифр
    const policyMatch = fullText.match(/Поліс\s*№\s*(\d{9})/) || 
                       fullText.match(/№(\d{9})/) ||
                       fullText.match(/(\d{9})/);
    const policyNumber = policyMatch ? policyMatch[1] : null;

    // 2. ИПН - 10 цифр после РНОКПП или ЄДРПОУ
    const ipnMatch = fullText.match(/РНОКПП[^\d]*(\d{10})/) ||
                    fullText.match(/ЄДРПОУ[^\d]*(\d{10})/);
    const ipn = ipnMatch ? ipnMatch[1] : null;

    // 3. Цена - ищем в строке "сплачується до або під час укладення Договору"
    const priceMatch = fullText.match(/Договору\s+(\d)\s+(\d{3}),00/) ||
                      fullText.match(/Договору\s+(\d{3}),00/) ||
                      fullText.match(/сплачується[^0-9]*(\d)\s+(\d{3}),00/) ||
                      fullText.match(/сплачується[^0-9]*(\d{3}),00/);
    let price = null;
    if (priceMatch) {
      if (priceMatch.length === 3) {
        price = priceMatch[1] + priceMatch[2];
      } else {
        price = priceMatch[1];
      }
    }

    // 4. ФИО страхувальника
    // 4. ФИО страхувальника - в разделе "3. Страхувальник" ищем строку с 3 заглавными словами
    const nameMatch = fullText.match(/3\.\s*Страхувальник[\s\S]*?([А-ЯЁІЇ]+\s+[А-ЯЁІЇ]+\s+[А-ЯЁІЇ]+)(?=\s|\n)/);
    const insuredName = nameMatch ? nameMatch[1].trim() : null;

    // 5. Дата початку (с временем)
    const startDateMatch = fullText.match(/5\.1[\s\S]*?(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/) ||
                      fullText.match(/з\s+(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/);
    const startDate = startDateMatch ? `${startDateMatch[2]}, ${startDateMatch[1]}` : null;

    // 6. Дата закінчення - сначала ищем в пункте 5.2, потом везде
    const endDateMatch = fullText.match(/5\.2[^0-9]*(\d{2}\.\d{2}\.\d{4})/) ||
                         fullText.match(/Дата закінчення[:\s]*(\d{2}\.\d{2}\.\d{4})/) ||
                         fullText.match(/до\s*(\d{2}\.\d{2}\.\d{4})/) ||
                         fullText.match(/(\d{2}\.\d{2}\.\d{4})/);
    const endDate = endDateMatch ? endDateMatch[1] : null;

    // 7. Марка и модель авто
    const carModelMatch = fullText.match(/9\.2\.\s*Марка\s+([А-ЯA-Z]+)\s+9\.3\.\s*Модель\s+([\d\-]+)/) ||
                         fullText.match(/Марка\s+([А-ЯA-Z]+)[\s\S]*?Модель\s+([\d\-]+)/);
    const carModel = carModelMatch ? `${carModelMatch[1]} ${carModelMatch[2]}`.trim() : null;

    // 8. Государственный номер авто
    const carNumberMatch = fullText.match(/Реєстраційний номер\s+([А-ЯA-Z]{2}\d{4}[А-ЯA-Z]{2})/) ||
                          fullText.match(/([А-ЯA-Z]{2}\d{4}[А-ЯA-Z]{2})/) ||
                          fullText.match(/номер[:\s]*([А-ЯA-Z]{2}\d{4}[А-ЯA-Z]{2})/);
    const carNumber = carNumberMatch ? carNumberMatch[1] : null;

    // Возвращаем результат в формате price|ipn|policy_number (для обратной совместимости)
    const result = `${price || ''}|${ipn || ''}|${policyNumber || ''}`;

    return res.status(200).json({
      success: true,
      result: result,
      details: {
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
}