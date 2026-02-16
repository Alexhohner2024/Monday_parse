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

    // Определение типа документа: Зеленая карта
    const isGreenCard = fullText.includes('ЗЕЛЕНА КАРТКА') || 
                        fullText.includes('GREEN CARD') || 
                        fullText.includes('МІЖНАРОДНОГО АВТОМОБІЛЬНОГО СТРАХУВАННЯ');

    if (isGreenCard) {
      // --- ЛОГИКА ДЛЯ ЗЕЛЕНОЙ КАРТЫ ---
      
      // 1. Номер полиса (Формат: UA/078/41856070)
      const policyMatch = fullText.match(/(UA\/\d{3}\/\d{8})/);
      const policyNumber = policyMatch ? policyMatch[1] : null;

      // 2. ИПН (РНОКПП)
      // В Зеленой карте часто идет просто числом 10 знаков после ФИО
      const ipnMatch = fullText.match(/РНОКПП[^\d]*(\d{10})/i) || 
                       fullText.match(/(?:\n|^)(\d{10})(?:\n|$)/m) ||
                       fullText.match(/(\d{10})/);
      const ipn = ipnMatch ? ipnMatch[1] : null;

      // 3. Цена (Формат: 1199,00)
      let price = null;
      // Ищем "10 Розмір страхової премії" и число на следующей строке или рядом
      const priceMatch = fullText.match(/10\s+Розмір\s+страхової\s+премії[^\n]*\n\s*(\d+)[.,]00/i) ||
                         fullText.match(/10\s+Розмір\s+страхової\s+премії[^\d]*(\d+)[.,]00/i);
      if (priceMatch) {
        price = priceMatch[1].replace(/\s/g, '');
      }

      // 4. ФИО страхувальника (UA или EN)
      let insuredName = null;
      const signatureMatch = fullText.match(/Страхувальник\s*\n\s*([A-ZА-ЯІЇЄҐЬ][A-ZА-ЯІЇЄҐЬа-яёіїєґь\s-]+)(?=\n|Підписано)/i);
      if (signatureMatch) {
        insuredName = signatureMatch[1].trim();
      }
      
      if (!insuredName) {
        const nameBlockMatch = fullText.match(/NAME\s+AND\s+ADDRESS\s+OF\s+THE\s+POLICYHOLDER[^\n]*\n[^\n]*\n\s*([A-ZА-ЯІЇЄҐЬ\s-]+)/i);
        if (nameBlockMatch) {
          insuredName = nameBlockMatch[1].trim();
        }
      }

      // 5. Даты (Начала, Окончания, Оформления)
      let startDate = null;
      let endDate = null;
      let issueDate = null;

      const startDateMatch = fullText.match(/5\.1\.\s*Дата\s+початку[^\d]*(\d{2}\.\d{2}\.\d{4})/i);
      if (startDateMatch) {
        startDate = startDateMatch[1] + ", 00:00";
      }

      const endDateMatch = fullText.match(/5\.2\.\s*Дата\s+закінчення[^\d]*(\d{2}\.\d{2}\.\d{4})/i);
      if (endDateMatch) {
        endDate = endDateMatch[1];
      }

      const issueDateMatch = fullText.match(/6\s+Дата\s+укладення\s+Договору[^\n]*\n\s*(\d{2}\.\d{2}\.\d{4})/i);
      if (issueDateMatch) {
        issueDate = issueDateMatch[1];
      }

      // 6. Данные авто (Марка, Модель, Госномер, VIN)
      let carModel = null;
      let carNumber = null;
      let vinNumber = null;

      const brandMatch = fullText.match(/9\.3\.\s*Марка\s*\n\s*([A-Z0-9\s-]+)/i);
      const modelMatch = fullText.match(/9\.4\.\s*Модель\s*\n\s*([A-Z0-9\s-]+)/i);
      if (brandMatch && modelMatch) {
        carModel = `${brandMatch[1].trim()} ${modelMatch[1].trim()}`;
      }

      const regNumberMatch = fullText.match(/9\.5\.\s*Реєстраційний\s+номер\s*\n\s*([A-ZА-Я0-9-]+)/i);
      if (regNumberMatch) {
        carNumber = regNumberMatch[1].trim();
      }

      const vinMatch = fullText.match(/9\.7\.\s*VIN[^\n]*\n\s*([A-Z0-9]{11,17})/i);
      if (vinMatch) {
        vinNumber = vinMatch[1].trim();
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
          issue_date: issueDate,
          car_model: carModel,
          car_number: carNumber,
          vin_number: vinNumber,
          type: 'green_card'
        }
      });

    } else {
      // --- СУЩЕСТВУЮЩАЯ ЛОГИКА (БЕЗ ИЗМЕНЕНИЙ) ---
      
      // 1. Номер полиса
      const policyMatch =
        fullText.match(/Поліс\s*№\s*(\d{9})/) ||
        fullText.match(/Акцепт\)\s*№\s*\d{6}-\d{4}-(\d{9})/) ||
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
      const premiumPriceMatch = fullText.match(/15\s+Розмір страхової премії[^\d]*(\d+)\s+(\d+)\.00/i);
      if (premiumPriceMatch) {
        price = premiumPriceMatch[1] + premiumPriceMatch[2];
      }
      if (!price) {
        const premiumPriceMatch2 = fullText.match(/15\s+Розмір страхової премії[^\d]*(\d+)\.00/i);
        if (premiumPriceMatch2) {
          price = premiumPriceMatch2[1];
        }
      }
      if (!price) {
        const newPriceMatch = fullText.match(/(?:5\.4\.\s*)?Страховий\s+платіж[^\d]*(\d+),00/i);
        if (newPriceMatch) {
          price = newPriceMatch[1];
        }
      }
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
      const formatWithNumberMatch = fullText.match(/(?:^|\n)(\d+)\s*(?:\n|\.\s*)\s*СТРАХУВАЛЬНИК\s*(?:\n|[\s\S]{0,50}?\n)\s*([А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+)/i);
      if (formatWithNumberMatch) {
        insuredName = formatWithNumberMatch[2].trim();
      }
      if (!insuredName) {
        const newFormatMatch = fullText.match(/1\.\s*СТРАХУВАЛЬНИК[^\n]*\n[^\n]*\n\s*([А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+)/i);
        if (newFormatMatch) {
          insuredName = newFormatMatch[1].trim();
        }
      }
      if (!insuredName) {
        const format3Match = fullText.match(/3\.?\s*СТРАХУВАЛЬНИК[\s\S]{0,200}?([А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+)(?=\s*\d{2}\.\d{2}\.\d{4}|\s*РНОКПП|\s*ІНПП|\s*ЄДРПОУ|\s*Дата|$)/i);
        if (format3Match) {
          insuredName = format3Match[1].trim();
        }
      }
      if (!insuredName) {
        const section3Match = fullText.match(/3\.\s*Страхувальник([\s\S]*?)(?=4\.|$)/);
        if (section3Match) {
          const section3Text = section3Match[1];
          const nameMatch =
            section3Text.match(/Найменування\s+([А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+)/) ||
            section3Text.match(/Найменування\s+([А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+)/) ||
            section3Text.match(/([А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][а-яёіїєґь]+)(?=\s*РНОКПП|\s*\d{10}|\s*дата)/);
          insuredName = nameMatch ? nameMatch[1].trim() : null;
        }
      }
      if (!insuredName) {
        const uppercaseMatch = fullText.match(/СТРАХУВАЛЬНИК\s*\n\s*([А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+)/);
        if (uppercaseMatch) {
          insuredName = uppercaseMatch[1].trim();
        }
      }
      if (!insuredName) {
        const oldNameMatch =
          fullText.match(/Страхувальник\s+([А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+\s+[А-ЯЁІЇЄҐЬ]+)/) ||
          fullText.match(/Страхувальник\s+([А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+\s+[А-ЯЁІЇЄҐЬ][А-ЯЁІЇЄҐЬа-яёіїєґь]+)/);
        insuredName = oldNameMatch ? oldNameMatch[1].trim() : null;
      }

      // 5. Дата початку
      let startDate = null;
      const startDateMatch0 = fullText.match(
        /З[\s\n]+(\d{2}:\d{2})[\s\n]+(\d{1,2})[\s\n]+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)[\s\n]+(\d{4})[\s\n]+р[\s\.\n]?/i
      );
      if (startDateMatch0) {
        const monthMap = {
          'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
          'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
          'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
        };
        const day = startDateMatch0[2].padStart(2, '0');
        const month = monthMap[startDateMatch0[3].toLowerCase()];
        const year = startDateMatch0[4];
        startDate = `${day}.${month}.${year}, ${startDateMatch0[1]}`;
      }
      if (!startDate) {
        const startDateMatch0Alt = fullText.match(
          /(?:5\.1|початку)[\s\S]*?З[\s\n]+(\d{2}:\d{2})[\s\n]+(\d{1,2})[\s\n]+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)[\s\n]+(\d{4})[\s\n]+р[\s\.\n]?/i
        );
        if (startDateMatch0Alt) {
          const monthMap = {
            'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
            'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
            'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
          };
          const day = startDateMatch0Alt[2].padStart(2, '0');
          const month = monthMap[startDateMatch0Alt[3].toLowerCase()];
          const year = startDateMatch0Alt[4];
          startDate = `${day}.${month}.${year}, ${startDateMatch0Alt[1]}`;
        }
      }
      if (!startDate) {
        const startDateMatch0Flex = fullText.match(
          /З[\s\n]*(\d{2}:\d{2})[\s\n]*(\d{1,2})[\s\n]*(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)[\s\n]*(\d{4})[\s\n]*р\b/i
        );
        if (startDateMatch0Flex) {
          const monthMap = {
            'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
            'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
            'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
          };
          const day = startDateMatch0Flex[2].padStart(2, '0');
          const month = monthMap[startDateMatch0Flex[3].toLowerCase()];
          const year = startDateMatch0Flex[4];
          startDate = `${day}.${month}.${year}, ${startDateMatch0Flex[1]}`;
        }
      }
      const startDateMatch1 =
        fullText.match(/5\.1[\s\S]*?(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/) ||
        fullText.match(/з\s+(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/) ||
        fullText.match(/початку[\s\S]*?(\d{2}:\d{2})\s+(\d{2}\.\d.2\.\d{4})/);
      const startDateMatch2 = fullText.match(
        /З\s+(\d{2}:\d{2})\s+(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./
      );
      const startDateMatch3 = fullText.match(
        /з\s+(\d{2}:\d{2})\s+год\.\s+(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./i
      );
      if (!startDate && startDateMatch1) {
        startDate = `${startDateMatch1[2]}, ${startDateMatch1[1]}`;
      } else if (!startDate && startDateMatch2) {
        const monthMap = {
          'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
          'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
          'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
        };
        const day = startDateMatch2[2].padStart(2, '0');
        const month = monthMap[startDateMatch2[3]];
        const year = startDateMatch2[4];
        startDate = `${day}.${month}.${year}, ${startDateMatch2[1]}`;
      } else if (!startDate && startDateMatch3) {
        const monthMap = {
          'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
          'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
          'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
        };
        const day = startDateMatch3[2].padStart(2, '0');
        const month = monthMap[startDateMatch3[3]];
        const year = startDateMatch3[4];
        startDate = `${day}.${month}.${year}, ${startDateMatch3[1]}`;
      }

      // 6. Дата закінчення
      let endDate = null;
      const endDateMatch1 =
        fullText.match(/5\.2[^0-9]*(\d{2}\.\d{2}\.\d{4})/) ||
        fullText.match(/Дата закінчення[:\s]*(\d{2}\.\d{2}\.\d{4})/) ||
        fullText.match(/до\s*(\d{2}\.\d{2}\.\d{4})/) ||
        fullText.match(/по\s+23:59\s+год\.\s+\(включно\)\s+(\d{2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./);
      const endDateMatch2 = fullText.match(
        /по\s+23:59\s+год\.\s+\(включно\)\s+(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})\s+р\./i
      );
      if (endDateMatch1) {
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

      // 7. Марка и модель авто
      let carModel = null;
      const tableMatch = fullText.match(/4\.1\.\s*Марка[,:\s]*модель[^\n]*\n\s*([A-ZА-ЯІЇЄҐЁ][A-ZА-ЯІЇЄҐЁA-Z0-9,\s-]+?)\s+((?:[А-ЯІЇЄҐA-Z]{2})?\d{4}[А-ЯІЇЄҐA-Z]{2})\s+([A-Z0-9]{17})\s/i);
      if (tableMatch) {
        carModel = tableMatch[1].trim().replace(/,\s*/g, ' ');
      }
      if (!carModel) {
      const markaMatch = fullText.match(/9\.2\.\s*Марка\s+([A-ZА-ЯІЇЄҐЁ][A-ZА-ЯІЇЄҐЁA-Z0-9\s-]+?)(?=\s*9\.\d+|$)/i);
      const modelMatch = fullText.match(/9\.3\.\s*Модель\s+([A-ZА-ЯІЇЄҐЁ0-9][A-ZА-ЯІЇЄҐЁ0-9\s-]+?)(?=\s*9\.\d+|$)/i);
      if (markaMatch && modelMatch) {
        carModel = `${markaMatch[1].trim()} ${modelMatch[1].trim()}`;
        }
      }
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
      if (carModel) {
        carModel = carModel
          .replace(/\s+\d+\s+Рік\s+випуску\s+\d{4}\b/i, '')
          .replace(/\s+Рік\s+випуску\s+\d{4}\b/i, '')
          .replace(/\s+(\d{4})\b$/i, (m, y) => {
            const yr = parseInt(y, 10);
            const now = new Date().getFullYear();
            return yr >= 1950 && yr <= now ? '' : m;
          })
          .trim();
      }

      // 8. Государственный номер авто
      let carNumber = null;
      if (tableMatch && tableMatch[2]) {
        carNumber = tableMatch[2].trim();
      }
      if (!carNumber) {
        const newCarNumberMatch = fullText.match(/4\.2\.\s*Реєстраційний номер\s+([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})/i);
        const newCarNumberMatch2 = fullText.match(/4\.2\.\s*Реєстраційний номер\s+(\d{5}[А-ЯІЇЄҐA-Z]{2})/i);
        const newCarNumberMatch3 = fullText.match(/4\.2\.\s*Реєстраційний номер\s+(\d{4}[А-ЯІЇЄҐA-Z]{2})/i);
        const carNumberMatch1 = fullText.match(/Реєстраційний номер\s+([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})/);
        const carNumberMatch2 = fullText.match(/Номерний знак\s+([А-ЯІЇЄҐA-Z]{2}\d{4}[А-ЯІЇЄҐA-Z]{2})/);
        const carNumberMatch3 = fullText.match(/Номерний знак\s+(\d{5}[А-ЯІЇЄҐA-Z]{2})/);
        const carNumberMatch4 = fullText.match(/Реєстраційний номер\s+(\d{5}[А-ЯІЇЄҐA-Z]{2})/);
        const carNumberMatch5 = fullText.match(/Номерний знак\s+(\d{4}[А-ЯІЇЄҐA-Z]{2})/);
        const carNumberMatch6 = fullText.match(/Реєстраційний номер\s+(\d{4}[А-ЯІЇЄҐA-Z]{2})/);
        carNumber =
          (newCarNumberMatch && newCarNumberMatch[1]) ||
          (newCarNumberMatch2 && newCarNumberMatch2[1]) ||
          (newCarNumberMatch3 && newCarNumberMatch3[1]) ||
          (carNumberMatch1 && carNumberMatch1[1]) ||
          (carNumberMatch2 && carNumberMatch2[1]) ||
          (carNumberMatch3 && carNumberMatch3[1]) ||
          (carNumberMatch4 && carNumberMatch4[1]) ||
          (carNumberMatch5 && carNumberMatch5[1]) ||
          (carNumberMatch6 && carNumberMatch6[1]) ||
          null;
      }

      // 9. VIN номер
      let vinNumber = null;
      if (tableMatch && tableMatch[3]) {
        vinNumber = tableMatch[3].trim();
      }
      if (!vinNumber) {
        const vinSectionMatch = fullText.match(/VIN[^A-Z0-9]{0,100}([A-Z0-9\s\n\r]{6,30})/i);
        if (vinSectionMatch) {
          const cleanedVin = vinSectionMatch[1].replace(/[\s\n\r]/g, '');
          const vinMatch = cleanedVin.match(/^[A-Z0-9]{6,17}/);
          if (vinMatch) {
            vinNumber = vinMatch[0];
          }
        }
        if (!vinNumber) {
          const vinMatch =
            fullText.match(/VIN[^\n]*([A-Z0-9]{11,17})/i) ||
            fullText.match(/Номер кузова[^\n]*([A-Z0-9]{11,17})/i) ||
            fullText.match(/VIN[:\s]*([A-Z0-9]{11,17})/i) ||
            fullText.match(/([A-Z0-9]{17})/);
          vinNumber = vinMatch ? vinMatch[1] : null;
        }
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
          car_number: carNumber,
          vin_number: vinNumber,
          type: 'standard'
        }
      });
    }
  } catch (error) {
    console.error('Error processing PDF:', error);
    return res.status(500).json({
      error: 'Failed to process PDF',
      message: error.message
    });
  }
}
