/**
 * Normaliza un comprobante al formato SERIE-CORRELATIVO
 * Maneja variantes como: E001-447, E001 - 447, E001-000447, E0001 - 00000447
 */
export function normalizeComprobante(comprobante: string): string {
  // Eliminar espacios
  let normalized = comprobante.replace(/\s+/g, "").trim();

  // Regex para detectar formato SERIE-CORRELATIVO (letras/números - números)
  const match = normalized.match(/^([A-Za-z0-9]+)-(\d+)$/);
  if (match) {
    // Serie: puede ser E001, E0001 - quitar ceros de la parte numérica
    const serieRaw = match[1];
    const serieMatch = serieRaw.match(/^([A-Za-z]*)(\d*)$/);
    const serie = serieMatch
      ? serieMatch[1] + (serieMatch[2] ? String(parseInt(serieMatch[2], 10) || 0) : "")
      : serieRaw.replace(/^0+/, "") || "0";
    const correlativo = match[2].replace(/^0+/, "") || "0";
    return `${serie}-${correlativo}`;
  }

  // Si no coincide, intentar extraer serie y correlativo de otros formatos
  const parts = normalized.split("-");
  if (parts.length >= 2) {
    const serie = parts[0].replace(/^0+/, "") || "0";
    const correlativo = parts[parts.length - 1].replace(/^0+/, "") || "0";
    return `${serie}-${correlativo}`;
  }

  return normalized;
}

/**
 * Extrae posibles comprobantes de un texto usando regex.
 * Incluye patrones para manejar errores de OCR (í→1, l→1, {→-, r→1, etc.)
 */
export function extractComprobantesFromText(text: string): Array<{ comprobante: string; normalized: string }> {
  const results: Array<{ comprobante: string; normalized: string }> = [];
  const seen = new Set<string>();

  // Limpiar texto para errores comunes de OCR
  const cleanedText = text
    .replace(/[íìïîÍÌÏÎ¡]/g, "1")
    .replace(/[{}]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[|]/g, "1")
    .replace(/([A-Za-z]0+)[rRlI](?=[0-9-]|$)/g, "$11")
    .replace(/([A-Za-z])[lI](?=\d)/g, "$11")
    .replace(/Bol(?=-\d)/g, "B01")
    .replace(/E0O1/g, "E001")
    .replace(/F0O1/g, "F001")
    .replace(/B0O1/g, "B01")
    .replace(/([EFBefb])0[Oo]1\b/g, "$1001")
    .replace(/([EFBefb])0[Oo](\d)/g, "$10$2")
    .replace(/Serie\s+de[Il1]\s+CDP/gi, "Serie del CDP")
    .replace(/Tota[Il1]\s+CP/gi, "Total CP");

  function addResult(serie: string, correlativo: string) {
    serie = serie.replace(/[rRlI]/g, "1").replace(/O(?=\d)/g, "0");
    correlativo = correlativo.replace(/[lIO]/g, (c) => (c === "O" ? "0" : "1"));

    // Serie válida: E/F/B + dígitos (E001, EB01) O solo números (001)
    const serieAlfanum = /^[EFBefb][A-Za-z]?[0-9]{1,4}$/.test(serie);
    const serieSoloNum = /^\d{1,4}$/.test(serie);
    if (!serieAlfanum && !serieSoloNum) return;

    // Correlativo: 2-6 dígitos, no puede ser 0 ni RUC (11 dígitos)
    const corrNum = parseInt(correlativo, 10);
    if (!/^\d+$/.test(correlativo) || correlativo.length < 2) return;
    if (corrNum === 0 || correlativo.length > 6) return;
    if (correlativo.length >= 8) return; // Evitar RUC/DNI (8-11 dígitos)

    const raw = `${serie}-${correlativo}`;
    const normalized = normalizeComprobante(raw);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push({ comprobante: raw, normalized });
    }
  }

  // Patrón 1: Estándar E001-677, EB01-51 (solo E, F, B)
  const re1 = /([EFBefb][A-Za-z]?[0-9]{1,4})\s*-\s*(\d{2,6})/g;
  let m;
  while ((m = re1.exec(cleanedText)) !== null) {
    addResult(m[1], m[2]);
  }

  // Patrón 2: E001-xxx con basura (ej: E001-Iig .jCI,J283) - extraer último grupo de dígitos
  const re2 = /([EeFfBb][A-Za-z]?0*[0-9]+)\s*[-]?\s*[^\d]*?(\d{2,6})/g;
  while ((m = re2.exec(cleanedText)) !== null) {
    addResult(m[1], m[2]);
  }

  // Patrón 3: EBol-51, E00r-677 (r/l como 1)
  const re3 = /([EeFfBb][A-Za-z]?0*[0-9rRlI]+)\s*-\s*(\d+)/g;
  while ((m = re3.exec(cleanedText)) !== null) {
    addResult(m[1], m[2]);
  }

  // Patrón 4: Nro: E001-677 o Nro: E001 . 677
  const re4 = /(?:Nro|N°|Nº)\s*:\s*([A-Za-z][A-Za-z0-9]*)\s*[-.]?\s*(\d+)/gi;
  while ((m = re4.exec(cleanedText)) !== null) {
    addResult(m[1], m[2]);
  }

  // Patrón 5: E001 677 o E001  677 (espacios en lugar de guión)
  const re5 = /\b([EeFfBb][A-Za-z]?0*[0-9]+)\s{1,3}(\d{2,6})\b/g;
  while ((m = re5.exec(cleanedText)) !== null) {
    addResult(m[1], m[2]);
  }

  // Patrón 6: FF04, EB01 - solo E, F, B como primera letra
  const re6 = /([EFBefb][A-Za-z][0-9]{1,4})\s*[-]?\s*(\d{2,6})/g;
  while ((m = re6.exec(cleanedText)) !== null) {
    addResult(m[1], m[2]);
  }

  // Patrón 7: "001-Nº 000283" - formato boleta (priorizar correlativo)
  const re7 = /(\d{1,4})\s*-\s*(?:Nº|N°|No|N\.?)\s*0*(\d{2,6})/gi;
  while ((m = re7.exec(cleanedText)) !== null) {
    addResult(m[1], m[2]);
  }

  // Patrón 7b: "001-000283" - correlativo 2-6 dígitos (evitar fechas 001-2024)
  const re7b = /\b(\d{1,4})\s*-\s*0*(\d{2,6})\b/g;
  while ((m = re7b.exec(cleanedText)) !== null) {
    const corr = m[2];
    if (corr.length >= 8) continue; // No RUC
    if (parseInt(corr, 10) === 0) continue;
    addResult(m[1], corr);
  }

  return results;
}
