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
 * Extrae RUC/DNI del texto (11 dígitos RUC, 8 dígitos DNI)
 * Prioriza el que aparece cerca de "Señor", "Cliente", "RUC"
 */
export function extractRuc(text: string): string {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Señor|Cliente|Razón Social|RUC|Identificado/i.test(line) || (i > 0 && /Señor|Cliente/i.test(lines[i - 1]))) {
      const ruc11 = line.match(/\b(\d{11})\b/);
      if (ruc11) return ruc11[1];
      const dni8 = line.match(/\b(\d{8})\b/);
      if (dni8) return dni8[1];
    }
  }
  const ruc = text.match(/\b(\d{11})\b/);
  if (ruc) return ruc[1];
  const dni = text.match(/\b(\d{8})\b/);
  return dni ? dni[1] : "";
}

/**
 * Extrae Razón Social / Nombre del proveedor o cliente
 * Busca después de "Señor(es):", "Cliente:", "Razón Social:"
 */
export function extractRazonSocial(text: string): string {
  const match = text.match(/(?:Señor\(es\)|Cliente|Razón Social|Razon Social)\s*[:\s]*([A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s\.\-&,]+?)(?:\n|RUC|$|Dirección)/i);
  if (match) {
    return match[1].trim().replace(/\s+/g, " ").substring(0, 80);
  }
  return "";
}

/**
 * Extrae el Importe Total principal del documento
 * Busca "Importe Total:", "Total:", "s/ XX.XX"
 */
export function extractImporteTotal(text: string): number {
  const totalMatch = text.match(/(?:Importe Total|Total|Total a pagar|Total CP)\s*[:\s]*(?:s\/?\s*)?(\d+[.,]\d{2})/i);
  if (totalMatch) {
    return parseFloat(totalMatch[1].replace(",", "."));
  }
  const sMatch = text.match(/s\/\s*(\d+[.,]\d{2})\b/i);
  if (sMatch) return parseFloat(sMatch[1].replace(",", "."));
  const importes = extractImportes(text);
  return importes.length > 0 ? importes[0] : 0;
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
