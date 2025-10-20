const pdf = require('pdf-parse');

module.exports = async function handler(req, res) {
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
    const policyMatch =
      fullText.match(/Поліс\s*№\s*(\d{9})/) ||
      fullText.match(/№\s*(\d{9})/) ||
      fullText.match(/Поліс\s+(\d{9})/) ||
      fullText.match(/(\d{9})/);
    const policyNumber = policyMatch ? policyMatch[1] : null;

    // 2. ИПН
    const ipnMatch =
      fullText.match(/РНОКПП[^\d]*(\d{10})/) ||
      fullText.match(/ЄДРПОУ[^\d]*(\d{10})/) ||
      fullText.match(/ІНПП[:\s]*(\d{10})/);
    const ipn = ipnMatch ? ipnMatch[1] : null;

    // 3. Цена - улучшенная логика
    let price = null;
    // Расширенные паттерны для поиска цены
    const pricePatterns = [
      /Договору\s+(\d)\s+(\d{3}),00/,
      /Договору\s+(\d{3}),00/,
      /сплачується[^0-9]*(\d)\s+(\d{3}),00/,
      /сплачується[^0-9]*(\d{3}),00/,
      /Страховий\s+платіж[^\d]*(\d)\s+(\d{3})\s+грн/,
      /Страховий\s+платіж[^\d]*(\d{3})\s+грн/,
      /платіж[^\d]*(\d)\s+(\d{3})\s+грн/,
      /платіж[^\d]*(\d{3})\s+грн/,
      /(\d{1,3})\s+(\d{3})\s+грн/,
      /(\d{1,3})\s+(\d{3}),00/,
      /(\d{4,6})\s+грн/,
      /(\d{4,6}),00/
    ];
    
    for (const pattern of pricePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        if (match.length === 3) {
          price = match[1] + match[2];
        } else {
          price = match[1];
        }
        break;
      }
    }

    // 4. ФИО страхувальника - улучшенная логика
    let insuredName = null;
    
    // Паттерны для поиска имени страхувальника
    const namePatterns = [
      // Раздел 3 с "Найменування"
      /3\.\s*Страхувальник[\s\S]*?Найменування\s+([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)/,
      // Прямой поиск в разделе 3
      /3\.\s*Страхувальник([\s\S]*?)(?=4\.|$)/,
      // Общий поиск по всему тексту
      /Страхувальник\s+([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)/,
      // Поиск ФИО после "Найменування"
      /Найменування\s+([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)/,
      // Поиск ФИО перед ИПН/РНОКПП
      /([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)(?=\s*РНОКПП|\s*\d{10}|\s*дата)/
    ];
    
    for (const pattern of namePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        if (pattern.source.includes('3\\.\\s*Страхувальник([\\s\\S]*?)')) {
          // Для паттерна раздела 3 ищем имя внутри секции
          const section3Text = match[1];
          const nameInSection = section3Text.match(/([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)/);
          if (nameInSection) {
            insuredName = nameInSection[1].trim();
            break;
          }
        } else {
          insuredName = match[1].trim();
          break;
        }
      }
    }

    // 5. Дата початку - улучшенная логика
    let startDate = null;
    
    // Паттерны для поиска даты начала
    const startDatePatterns = [
      // Раздел 5.1 с временем и датой
      /5\.1[\s\S]*?(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/,
      // "з" с временем и датой
      /з\s+(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/,
      // "початку" с временем и датой
      /початку[\s\S]*?(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/,
      // "З" с временем и названием месяца
      /З\s+(\d{2}:\d{2})\s+(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./,
      // Простой поиск даты с временем
      /(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/,
      // Поиск даты без времени
      /(\d{2}\.\d{2}\.\d{4})/
    ];
    
    const monthMap = {
      'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
      'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
      'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
    };
    
    for (const pattern of startDatePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        if (pattern.source.includes('січня|лютого')) {
          // Формат с названием месяца
          const day = match[2].padStart(2, '0');
          const month = monthMap[match[3]];
          const year = match[4];
          startDate = `${day}.${month}.${year}, ${match[1]}`;
          break;
        } else if (match.length === 3 && match[1].includes(':')) {
          // Формат с временем и датой
          startDate = `${match[2]}, ${match[1]}`;
          break;
        } else if (match.length === 2 && match[1].includes('.')) {
          // Только дата
          startDate = match[1];
          break;
        }
      }
    }

    // 6. Дата закінчення
    let endDate = null;
    const endDateMatch1 =
      fullText.match(/5\.2[^0-9]*(\d{2}\.\d{2}\.\d{4})/) ||
      fullText.match(/Дата закінчення[:\s]*(\d{2}\.\d{2}\.\d{4})/) ||
      fullText.match(/до\s*(\d{2}\.\d{2}\.\d{4})/);
    const endDateMatch2 = fullText.match(
      /по\s+(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./
    );
    if (endDateMatch1) {
      endDate = endDateMatch1[1];
    } else if (endDateMatch2) {
      const day = endDateMatch2[1].padStart(2, '0');
      const month = monthMap[endDateMatch2[2]];
      const year = endDateMatch2[3];
      endDate = `${day}.${month}.${year}`;
    } else {
      const fallbackDate = fullText.match(/(\d{2}\.\d{2}\.\d{4})/);
      endDate = fallbackDate ? fallbackDate[1] : null;
    }

    // 7. Марка и модель авто - улучшенная логика для разных форматов
    let carModel = null;
    
    // Формат 1: Раздел 9 с отдельными полями "9.2. Марка" и "9.3. Модель"
    const markaMatch = fullText.match(/9\.2\.\s*Марка\s+([A-ZА-ЯІЇЄҐЁ][A-ZА-ЯІЇЄҐЁA-Z\s-]+?)(?=\s*9\.\d+|$)/i);
    const modelMatch = fullText.match(/9\.3\.\s*Модель\s+([A-ZА-ЯІЇЄҐЁ0-9][A-ZА-ЯІЇЄҐЁ0-9\s-]+?)(?=\s*9\.\d+|$)/i);
    
    if (markaMatch && modelMatch) {
      // Новый формат с разделом 9
      carModel = `${markaMatch[1].trim()} ${modelMatch[1].trim()}`;
    } else {
      // Формат 2: Старые форматы "Марка, модель"
      const carModelMatch =
        fullText.match(/Марка[,:\s]*модель\s*([^\n\r]+)/i) ||
        fullText.match(/Марка[\s\S]{0,40}?([^\n\r]+)[\s\S]{0,40}?Модель[\s\S]{0,40}?([^\n\r]+)/i);

      if (carModelMatch) {
        carModel = carModelMatch.length === 3
          ? `${carModelMatch[1].trim()} ${carModelMatch[2].trim()}`
          : carModelMatch[1].trim();
      }
    }

    // Универсальная очистка car_model
    if (carModel) {
      carModel = carModel
        // Удаляем "6 Рік випуску 1990"
        .replace(/\s+\d+\s+Рік\s+випуску\s+\d{4}\b/i, '')
        // Удаляем "Рік випуску 1990"
        .replace(/\s+Рік\s+випуску\s+\d{4}\b/i, '')
        // Удаляем год в конце, если это действительно год выпуска (1950-текущий)
        .replace(/\s+(\d{4})\b$/i, (m, y) => {
          const yr = parseInt(y, 10);
          const now = new Date().getFullYear();
          return yr >= 1950 && yr <= now ? '' : m;
        })
        .trim();
    }

    // 8. Государственный номер авто
    let carNumber = null;
    const carNumberMatch1 = fullText.match(/Реєстраційний номер\s+([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})/);
    const carNumberMatch2 = fullText.match(/Номерний знак\s+([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})/);
    const carNumberMatch3 = fullText.match(/Номерний знак\s+(\d{5}[А-ЯІЇЄҐA-Z]{2})/);
    const carNumberMatch4 = fullText.match(/Реєстраційний номер\s+(\d{5}[А-ЯІЇЄҐA-Z]{2})/);
    carNumber =
      (carNumberMatch1 && carNumberMatch1[1]) ||
      (carNumberMatch2 && carNumberMatch2[1]) ||
      (carNumberMatch3 && carNumberMatch3[1]) ||
      (carNumberMatch4 && carNumberMatch4[1]) ||
      null;

    const result = `${price || ''}|${ipn || ''}|${policyNumber || ''}`;

    // Отладочная информация
    console.log('Extraction results:', {
      price: price,
      ipn: ipn,
      policyNumber: policyNumber,
      insuredName: insuredName,
      startDate: startDate,
      endDate: endDate,
      carModel: carModel,
      carNumber: carNumber
    });

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
}