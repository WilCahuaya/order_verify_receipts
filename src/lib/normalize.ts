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
 * Extrae posibles comprobantes de un texto usando regex
 * Detecta formatos: E001-447, E001 - 447, E001-000447, E0001 - 00000447
 */
export function extractComprobantesFromText(text: string): Array<{ comprobante: string; normalized: string }> {
  const results: Array<{ comprobante: string; normalized: string }> = [];
  const seen = new Set<string>();

  // Regex flexible para detectar comprobantes
  // Patrón: letras/números opcionales, espacios opcionales, guión, espacios opcionales, números
  const regex = /([A-Za-z][A-Za-z0-9]*)\s*-\s*(\d+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const normalized = normalizeComprobante(raw);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push({ comprobante: raw, normalized });
    }
  }

  return results;
}
