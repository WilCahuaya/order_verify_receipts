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
    .replace(/([A-Za-z]0+)[rRlI](?=[0-9-]|$)/g, "$11")
    .replace(/([A-Za-z])[lI](?=\d)/g, "$11")
    .replace(/Bol(?=-\d)/g, "B01");

  function addResult(serie: string, correlativo: string) {
    serie = serie.replace(/[rRlI]/g, "1").replace(/O(?=\d)/g, "0");
    correlativo = correlativo.replace(/[lIO]/g, (c) => (c === "O" ? "0" : "1"));

    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(serie)) return;
    if (!/^\d+$/.test(correlativo) || correlativo.length < 2) return;

    const raw = `${serie}-${correlativo}`;
    const normalized = normalizeComprobante(raw);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push({ comprobante: raw, normalized });
    }
  }

  // Patrón 1: Estándar E001-677, EB01-51
  const re1 = /([A-Za-z][A-Za-z0-9]*)\s*-\s*(\d+)/g;
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

  return results;
}
