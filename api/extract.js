const pdf = require('pdf-parse');

export default async function handler(req, res) {
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
      fullText.match(/Акцепт\)\s*№\s*\d{6}-\d{4}-(\d{9})/) ||  // Новий формат: Акцепт) № 611933-2212-224712543
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

    // 3. Цена
    let price = null;

    // Новий формат: "990,00 (Дев'ятсот дев'яносто гривень 00 копійок)" або "5.4. Страховий платіж, грн 990,00"
    const newPriceMatch = fullText.match(/(?:5\.4\.\s*)?Страховий\s+платіж[^\d]*(\d+),00/i);
    if (newPriceMatch) {
      price = newPriceMatch[1];
    }

    // Старі формати
    if (!price) {
      const priceMatch1 =
        fullText.match(/Договору\s+(\d)\s+(\d{3}),00/) ||
        fullText.match(/Договору\s+(\d{3}),00/) ||
        fullText.match(/сплачується[^0-9]*(\d)\s+(\d{3}),00/) ||
        fullText.match(/сплачується[^0-9]*(\d{3}),00/);
      const priceMatch2 =
        fullText.match(/Страховий\s+платіж[^\d]*(\d)\s+(\d{3})\s+грн/) ||
        fullText.match(/Страховий\s+платіж[^\d]*(\d{3})\s+грн/) ||
        fullText.match(/платіж[^\d]*(\d)\s+(\d{3})\s+грн/) ||
        fullText.match(/платіж[^\d]*(\d{3})\s+грн/);
      const priceMatch = priceMatch1 || priceMatch2;
      if (priceMatch) {
        price = priceMatch.length === 3 ? priceMatch[1] + priceMatch[2] : priceMatch[1];
      }
    }

    // 4. ФИО страхувальника
    let insuredName = null;

    // Новий формат: "1. СТРАХУВАЛЬНИК" з ПІБ на наступному рядку
    const newFormatMatch = fullText.match(/1\.\s*СТРАХУВАЛЬНИК[^\n]*\n[^\n]*\n\s*([А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+)/i);
    if (newFormatMatch) {
      insuredName = newFormatMatch[1].trim();
    }

    // Старий формат: секція 3. Страхувальник
    if (!insuredName) {
      const section3Match = fullText.match(/3\.\s*Страхувальник([\s\S]*?)(?=4\.|$)/);
      if (section3Match) {
        const section3Text = section3Match[1];
        const nameMatch =
          section3Text.match(/Найменування\s+([А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+)/) ||
          section3Text.match(/Найменування\s+([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)/) ||
          section3Text.match(/([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)(?=\s*РНОКПП|\s*\d{10}|\s*дата)/);
        insuredName = nameMatch ? nameMatch[1].trim() : null;
      }
    }

    // Запасний варіант: прямо після "Страхувальник"
    if (!insuredName) {
      const oldNameMatch =
        fullText.match(/Страхувальник\s+([А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+)/) ||
        fullText.match(/Страхувальник\s+([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)/);
      insuredName = oldNameMatch ? oldNameMatch[1].trim() : null;
    }

    // 5. Дата початку
    let startDate = null;
    const startDateMatch1 =
      fullText.match(/5\.1[\s\S]*?(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/) ||
      fullText.match(/з\s+(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/) ||
      fullText.match(/початку[\s\S]*?(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/);
    const startDateMatch2 = fullText.match(
      /З\s+(\d{2}:\d{2})\s+(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./
    );
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
    const endDateMatch1 =
      fullText.match(/5\.2[^0-9]*(\d{2}\.\d{2}\.\d{4})/) ||
      fullText.match(/Дата закінчення[:\s]*(\d{2}\.\d{2}\.\d{4})/) ||
      fullText.match(/до\s*(\d{2}\.\d{2}\.\d{4})/) ||
      fullText.match(/по\s+23:59\s+год\.\s+\(включно\)\s+(\d{2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./);  // Новий формат
    const endDateMatch2 = fullText.match(
      /по\s+(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./
    );

    if (endDateMatch1) {
      // Перевірка чи це новий формат з місяцем словом
      if (endDateMatch1.length === 4) {
        const monthMap = {
          'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
          'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
          'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
        };
        const day = endDateMatch1[1].padStart(2, '0');
        const month = monthMap[endDateMatch1[2]];
        const year = endDateMatch1[3];
        endDate = `${day}.${month}.${year}`;
      } else {
        endDate = endDateMatch1[1];
      }
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
      const fallbackDate = fullText.match(/(\d{2}\.\d{2}\.\d{4})/);
      endDate = fallbackDate ? fallbackDate[1] : null;
    }

    // 7. Марка и модель авто - улучшенная логика для разных форматов
    let carModel = null;

    // Формат 1: Новий формат заяви-приєднання "4.1. Марка, модель" (табличний формат)
    // Заголовки: "4.1. Марка, модель 4.2. Реєстраційний номер..."
    // Дані: "Nissan, Maxima ВН2544ОО..."
    const tableMatch = fullText.match(/4\.1\.\s*Марка[,:\s]*модель[^\n]*\n\s*([A-ZА-ЯІЇЄҐЁ][A-ZА-ЯІЇЄҐЁA-Z0-9,\s-]+?)\s+([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})\s/i);
    if (tableMatch) {
      carModel = tableMatch[1].trim().replace(/,\s*/g, ' ');  // Замінюємо коми на пробіли
    }

    // Формат 2: Раздел 9 с отдельными полями "9.2. Марка" и "9.3. Модель"
    if (!carModel) {
      const markaMatch = fullText.match(/9\.2\.\s*Марка\s+([A-ZА-ЯІЇЄҐЁ][A-ZА-ЯІЇЄҐЁA-Z0-9\s-]+?)(?=\s*9\.\d+|$)/i);
      const modelMatch = fullText.match(/9\.3\.\s*Модель\s+([A-ZА-ЯІЇЄҐЁ0-9][A-ZА-ЯІЇЄҐЁ0-9\s-]+?)(?=\s*9\.\d+|$)/i);

      if (markaMatch && modelMatch) {
        carModel = `${markaMatch[1].trim()} ${modelMatch[1].trim()}`;
      }
    }

    // Формат 3: Старые форматы "Марка, модель"
    if (!carModel) {
      const carModelMatch =
        fullText.match(/Марка[,:\s]*модель\s+([А-ЯA-Z0-9][А-ЯA-Z0-9\s-]+?)(?=\s+Рік)/i) ||
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

    // Новий формат: табличний (витягуємо з того ж match що і car_model)
    if (tableMatch && tableMatch[2]) {
      carNumber = tableMatch[2].trim();
    }

    // Інші формати якщо табличний не спрацював
    if (!carNumber) {
      const newCarNumberMatch = fullText.match(/4\.2\.\s*Реєстраційний номер\s+([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})/i);
      const newCarNumberMatch2 = fullText.match(/4\.2\.\s*Реєстраційний номер\s+(\d{5}[А-ЯІЇЄҐA-Z]{2})/i);
      const carNumberMatch1 = fullText.match(/Реєстраційний номер\s+([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})/);
      const carNumberMatch2 = fullText.match(/Номерний знак\s+([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})/);
      const carNumberMatch3 = fullText.match(/Номерний знак\s+(\d{5}[А-ЯІЇЄҐA-Z]{2})/);
      const carNumberMatch4 = fullText.match(/Реєстраційний номер\s+(\d{5}[А-ЯІЇЄҐA-Z]{2})/);

      carNumber =
        (newCarNumberMatch && newCarNumberMatch[1]) ||
        (newCarNumberMatch2 && newCarNumberMatch2[1]) ||
        (carNumberMatch1 && carNumberMatch1[1]) ||
        (carNumberMatch2 && carNumberMatch2[1]) ||
        (carNumberMatch3 && carNumberMatch3[1]) ||
        (carNumberMatch4 && carNumberMatch4[1]) ||
        null;
    }

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
