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
 * Prioriza "Total CP" (columna del Excel) y "Importe Total"
 */
export function extractImporteTotal(text: string): number {
  const cleaned = preprocessForLabels(text);
  // Prioridad 1: Total CP (etiqueta exacta del Excel)
  const totalCPMatch = cleaned.match(/Total\s+CP\s*[:\s]*(?:s\/?\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+[.,]\d{2})/i);
  if (totalCPMatch) {
    const num = parseFloat(totalCPMatch[1].replace(/\./g, "").replace(",", "."));
    if (!isNaN(num) && num > 0) return num;
  }
  // Prioridad 2: Importe Total, Total a pagar
  const totalMatch = cleaned.match(/(?:Importe Total|Total\s+a\s+pagar)\s*[:\s]*(?:s\/?\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+[.,]\d{2})/i);
  if (totalMatch) {
    const num = parseFloat(totalMatch[1].replace(/\./g, "").replace(",", "."));
    if (!isNaN(num) && num > 0) return num;
  }
  // Prioridad 3: Total: s/ XX.XX
  const totalGenMatch = cleaned.match(/Total\s*[:\s]*(?:s\/?\s*)?(\d+[.,]\d{2})/i);
  if (totalGenMatch) {
    return parseFloat(totalGenMatch[1].replace(",", "."));
  }
  const sMatch = cleaned.match(/s\/\s*(\d+[.,]\d{2})\b/i);
  if (sMatch) return parseFloat(sMatch[1].replace(",", "."));
  const importes = extractImportes(cleaned);
  return importes.length > 0 ? importes[0] : 0;
}

/**
 * Preprocesa texto para corregir errores comunes de OCR en etiquetas y valores.
 */
function preprocessForLabels(text: string): string {
  return text
    .replace(/Serie\s+de[Il1]\s+CDP/gi, "Serie del CDP")
    .replace(/Serie\s+de\s+CDP/gi, "Serie del CDP")
    .replace(/Nro\s+CP\s+o\s+Doc\.?\s*Nro\s+Inicia[Il1]/gi, "Nro CP o Doc. Nro Inicial")
    .replace(/Doc\.?\s*Nro\s+Inicia[Il1]/gi, "Doc. Nro Inicial")
    .replace(/Tota[Il1]\s+CP/gi, "Total CP")
    .replace(/([EFBefb])0[Oo]1/g, "$1001")
    .replace(/([EFBefb])0[Oo](\d)/g, "$100$2")
    .replace(/E0O1/g, "E001")
    .replace(/F0O1/g, "F001")
    .replace(/B0O1/g, "B01");
}

/**
 * Extrae Serie del CDP buscando etiquetas como "Serie del CDP:", "Serie:", etc.
 * Valores esperados: E001, F001, B001, EB01, 001, etc.
 */
export function extractSerieFromLabels(text: string): string {
  const cleaned = preprocessForLabels(text);
  const patterns = [
    /(?:Serie\s+del\s+CDP|Serie\s+del\s+Comprobante|Serie)\s*[:\s]*([A-Za-z0-9]{2,6})\b/i,
    /(?:Serie\s+del\s+CDP|Serie)\s*[:\s]*([EFBefb][A-Za-z]?0*[0-9]+)/i,
    /\bSerie\s*[:\s]*([EFBefb][A-Za-z]?[0-9]{1,4})\b/i,
    /Serie\s*[:\s]*(\d{1,4})\b/i,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m) {
      let serie = m[1].trim().replace(/\s+/g, "");
      serie = serie.replace(/O(?=\d)/g, "0").replace(/[lI](?=\d)/g, "1");
      if (/^[EFBefb][A-Za-z]?[0-9]{1,4}$/.test(serie) || /^\d{1,4}$/.test(serie)) {
        return serie.replace(/^0+/, "") || "0";
      }
    }
  }
  return "";
}

/**
 * Extrae Nro CP / Doc. Nro Inicial (Rango) / Correlativo buscando etiquetas.
 */
export function extractCorrelativoFromLabels(text: string): string {
  const cleaned = preprocessForLabels(text);
  const patterns = [
    /(?:Nro\s+CP|Nro\s+CP\s+o\s+Doc\.?\s*Nro\s+Inicial|Doc\.?\s*Nro\s+Inicial\s*\(?Rango\)?|Correlativo|Número)\s*[:\s]*(\d{1,8})\b/i,
    /(?:Nro\s+CP|Correlativo)\s*[:\s]*0*(\d{2,8})\b/i,
    /(?:Doc\.?\s*Nro|Nro\s+Inicial)\s*[:\s]*(\d{1,8})\b/i,
    /Rango\s*[:\s]*(\d{1,8})\b/i,
    /(?:Nº|N°|No\.?)\s*[:\s]*0*(\d{2,8})\b/i,
    // Valor en línea siguiente: "Nro CP" seguido de número en misma o siguiente línea
    /(?:Nro\s+CP|Correlativo)[:\s]*\n\s*(\d{1,8})\b/im,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m) {
      const corr = m[1].replace(/^0+/, "") || "0";
      if (corr.length >= 1 && corr.length <= 8 && parseInt(corr, 10) > 0) return corr;
    }
  }
  return "";
}

/**
 * Extrae comprobante completo (SERIE-CORRELATIVO) usando etiquetas del documento.
 * Si encuentra Serie y Correlativo por etiquetas, los combina.
 */
export function extractComprobanteFromLabels(text: string): { serie: string; correlativo: string } | null {
  const serie = extractSerieFromLabels(text);
  const correlativo = extractCorrelativoFromLabels(text);
  if (serie && correlativo) {
    return { serie, correlativo };
  }
  return null;
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
