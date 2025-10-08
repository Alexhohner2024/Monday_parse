// Очистка car_model: убрать "Рік випуску 1990", но сохранить цифровую модель
if (carModel) {
  carModel = carModel
    // убрать вариант с числом перед фразой
    .replace(/\s+\d+\s+Рік\s+випуску\s+\d{4}\b/i, '')
    // убрать фразу без числа перед ней
    .replace(/\s+Рік\s+випуску\s+\d{4}\b/i, '')
    // убрать висящий год в конце, если это реально год (1950..текущий)
    .replace(/\s+(\d{4})\b$/, (m, y) => {
      const yr = parseInt(y, 10);
      const now = new Date().getFullYear();
      return yr >= 1950 && yr <= now ? '' : m;
    })
    .trim();
}