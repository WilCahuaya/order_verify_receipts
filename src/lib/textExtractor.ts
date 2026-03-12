/**
 * Extrae fechas del texto (formato DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
 */
export function extractFechas(text: string): string[] {
  const fechas: string[] = [];
  const seen = new Set<string>();

  // DD/MM/YYYY o DD-MM-YYYY
  const regex1 = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
  let match;
  while ((match = regex1.exec(text)) !== null) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const fecha = `${year}-${month}-${day}`;
    if (!seen.has(fecha)) {
      seen.add(fecha);
      fechas.push(fecha);
    }
  }

  // YYYY-MM-DD
  const regex2 = /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g;
  while ((match = regex2.exec(text)) !== null) {
    const fecha = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    if (!seen.has(fecha)) {
      seen.add(fecha);
      fechas.push(fecha);
    }
  }

  return fechas;
}

/**
 * Extrae importes del texto (números con decimales, formato 1,234.56 o 1234.56)
 */
export function extractImportes(text: string): number[] {
  const importes: number[] = [];
  const seen = new Set<number>();

  // Patrones para importes: 1,234.56 o 1234.56 o 1234,56
  const regex = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+[.,]\d{2})/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const cleaned = match[1].replace(/\./g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 0 && num < 10000000 && !seen.has(num)) {
      seen.add(num);
      importes.push(num);
    }
  }

  // También buscar formato simple: 1234.56
  const regex2 = /\b(\d+[.,]\d{2})\b/g;
  while ((match = regex2.exec(text)) !== null) {
    const num = parseFloat(match[1].replace(",", "."));
    if (!isNaN(num) && num > 0 && num < 10000000 && !seen.has(num)) {
      seen.add(num);
      importes.push(num);
    }
  }

  return importes;
}
