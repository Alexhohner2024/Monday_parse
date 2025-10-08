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
                       fullText.match(/№\s*(\d{9})/) ||
                       fullText.match(/Поліс\s+(\d{9})/) ||
                       fullText.match(/(\d{9})/);
    const policyNumber = policyMatch ? policyMatch[1] : null;

    // 2. ИПН - 10 цифр после РНОКПП, ЄДРПОУ или ІНПП (для старых полисов)
    const ipnMatch = fullText.match(/РНОКПП[^\d]*(\d{10})/) ||
                    fullText.match(/ЄДРПОУ[^\d]*(\d{10})/) ||
                    fullText.match(/ІНПП[^\d]*(\d{10})/);
    const ipn = ipnMatch ? ipnMatch[1] : null;

    // 3. Цена - ищем в нескольких вариантах
    let price = null;
    
    // Новый формат: "сплачується до або під час укладення Договору"
    const priceMatch1 = fullText.match(/Договору\s+(\d)\s+(\d{3}),00/) ||
                       fullText.match(/Договору\s+(\d{3}),00/) ||
                       fullText.match(/сплачується[^0-9]*(\d)\s+(\d{3}),00/) ||
                       fullText.match(/сплачується[^0-9]*(\d{3}),00/);
    
    // Старый формат: "Страховий платіж 1 310 грн. 00 коп."
    const priceMatch2 = fullText.match(/Страховий\s+платіж[^\d]*(\d)\s+(\d{3})\s+грн/) ||
                       fullText.match(/Страховий\s+платіж[^\d]*(\d{3})\s+грн/) ||
                       fullText.match(/платіж[^\d]*(\d)\s+(\d{3})\s+грн/) ||
                       fullText.match(/платіж[^\d]*(\d{3})\s+грн/);
    
    const priceMatch = priceMatch1 || priceMatch2;
    
    if (priceMatch) {
      if (priceMatch.length === 3) {
        price = priceMatch[1] + priceMatch[2];
      } else {
        price = priceMatch[1];
      }
    }

    // 4. ФИО страхувальника
    let insuredName = null;
    
    // Новый формат: раздел "3. Страхувальник" с "Найменування"
    const section3Match = fullText.match(/3\.\s*Страхувальник([\s\S]*?)(?=4\.|$)/);
    if (section3Match) {
      const section3Text = section3Match[1];
      const nameMatch = section3Text.match(/Найменування\s+([А-ЯЁІЇ]+\s+[А-ЯЁІЇ]+\s+[А-ЯЁІЇ]+)/) ||
                   section3Text.match(/Найменування\s+([А-ЯЁІЇ][а-яёії]+\s+[А-ЯЁІЇ][а-яёії]+\s+[А-ЯЁІЇ][а-яёії]+)/) ||
                   section3Text.match(/([А-ЯЁІЇ][а-яёії]+\s+[А-ЯЁІЇ][а-яёії]+\s+[А-ЯЁІЇ][а-яёії]+)(?=\s*РНОКПП|\s*\d{10})/);
      insuredName = nameMatch ? nameMatch[1].trim() : null;
    }
    
    // Старый формат: "Страхувальник" сразу после которого идёт ФИО (БЕЗ "Найменування")
    if (!insuredName) {
      const oldNameMatch = fullText.match(/Страхувальник\s+([А-ЯЁІЇ]+\s+[А-ЯЁІЇ]+\s+[А-ЯЁІЇ]+)/) ||
                          fullText.match(/Страхувальник\s+([А-ЯЁІЇ][а-яёії]+\s+[А-ЯЁІЇ][а-яёії]+\s+[А-ЯЁІЇ][а-яёії]+)/);
      insuredName = oldNameMatch ? oldNameMatch[1].trim() : null;
    }

    // 5. Дата початку
    let startDate = null;
    
    // Новый формат: "5.1 ... 00:00 01.01.2024"
    const startDateMatch1 = fullText.match(/5\.1[\s\S]*?(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/) ||
                           fullText.match(/з\s+(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/) ||
                           fullText.match(/початку[\s\S]*?(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/);
    
    // Старый формат: "З 00:00 09 жовтня 2024 р."
    const startDateMatch2 = fullText.match(/З\s+(\d{2}:\d{2})\s+(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./);
    
    if (startDateMatch1) {
      startDate = `${startDateMatch1[2]}, ${startDateMatch1[1]}`;
    } else if (startDateMatch2) {
      const monthMap = {
        'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
        'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
        'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
      };
      const day = startDateMatch2[2].padStart(2, '0');
      const month = monthMap[startDateMatch2[3]];
      const year = startDateMatch2[4];
      startDate = `${day}.${month}.${year}, ${startDateMatch2[1]}`;
    }

    // 6. Дата закінчення
    let endDate = null;
    
    // Новый формат: "5.2 ... 01.01.2025"
    const endDateMatch1 = fullText.match(/5\.2[^0-9]*(\d{2}\.\d{2}\.\d{4})/) ||
                         fullText.match(/Дата закінчення[:\s]*(\d{2}\.\d{2}\.\d{4})/) ||
                         fullText.match(/до\s*(\d{2}\.\d{2}\.\d{4})/);
    
    // Старый формат: "по 08 жовтня 2025 р."
    const endDateMatch2 = fullText.match(/по\s+(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./);
    
    if (endDateMatch1) {
      endDate = endDateMatch1[1];
    } else if (endDateMatch2) {
      const monthMap = {
        'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
        'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
        'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
      };
      const day = endDateMatch2[1].padStart(2, '0');
      const month = monthMap[endDateMatch2[2]];
      const year = endDateMatch2[3];
      endDate = `${day}.${month}.${year}`;
    } else {
      // Fallback: ищем любую дату
      const fallbackDate = fullText.match(/(\d{2}\.\d{2}\.\d{4})/);
      endDate = fallbackDate ? fallbackDate[1] : null;
    }

    // 7. Марка и модель авто - УНИВЕРСАЛЬНЫЙ ПАТТЕРН
    let carModel = null;
    const carModelMatch = 
      // Формат: "Марка, модель Mercedes-Benz VITO 110 CDI"
      fullText.match(/Марка[,:\s]*модель\s*([^\n\r]+)/i)
      // Формат: "Марка ... Модель ...", оба захватывают любые символы до перевода строки
      || fullText.match(/Марка[\s\S]{0,40}?([^\n\r]+)[\s\S]{0,40}?Модель[\s\S]{0,40}?([^\n\r]+)/i);

    if (carModelMatch) {
      if (carModelMatch.length === 3) {
        carModel = `${carModelMatch[1].trim()} ${carModelMatch[2].trim()}`;
      } else {
        carModel = carModelMatch[1].trim();
      }
    }

    // 8. Государственный номер авто
    let carNumber = null;
    
    // Новый формат: "Реєстраційний номер"
    const carNumberMatch1 = fullText.match(/Реєстраційний номер\s+([А-ЯA-ZІЇ]{2}\d{4}[А-ЯA-ZІЇ]{2})/);
    
    // Старый формат: "Номерний знак ВН0637ІХ"
    const carNumberMatch2 = fullText.match(/Номерний знак\s+([А-ЯA-ZІЇ]{2}\d{4}[А-ЯA-ZІЇ]{2})/);
    
    carNumber = carNumberMatch1 ? carNumberMatch1[1] : (carNumberMatch2 ? carNumberMatch2[1] : null);

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
