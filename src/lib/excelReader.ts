import ExcelJS from "exceljs";
import { normalizeComprobante } from "./normalize";
import type { ComprobanteExcel } from "./types";

const COLUMN_MAPPINGS = {
  serie: ["Serie del CDP", "Serie", "serie"],
  correlativo: [
    "Nro CP o Doc. Nro Inicial (Rango)",
    "Nro Final (Rango)",
    "Correlativo",
    "Nro CP",
    "correlativo",
  ],
  fecha: [
    "Fecha de Emision",
    "Fecha Emision Doc",
    "Fecha de Cancelacion",
    "Fecha Emision",
    "Fecha",
    "fecha",
  ],
  importe: [
    "Total CP",
    "Importe Total",
    "importe total",
    "Total",
    "Tipo de Cambio",
    "Valor Adq. NG",
    "BI Gravado DNG",
    "Total Ventas",
  ],
  nroDocIdentidad: [
    "Nro Doc Identidad",
    "RUC",
    "DNI",
    "nro doc identidad",
  ],
  razonSocial: [
    "Apellidos Nombres/ Razón Social",
    "Razón Social",
    "Razon Social",
    "Proveedor",
    "Cliente",
  ],
};

function findColumnIndex(worksheet: ExcelJS.Worksheet, possibleNames: string[]): number {
  const firstRow = worksheet.getRow(1);
  if (!firstRow) return -1;

  for (let col = 1; col <= 100; col++) {
    const cell = firstRow.getCell(col);
    const value = cell.value;
    const str = (typeof value === "object" && value !== null && "text" in value
      ? String((value as { text: unknown }).text)
      : String(value ?? "")
    ).trim();
    if (possibleNames.some((name) => str.toLowerCase().includes(name.toLowerCase()))) {
      return col;
    }
  }
  return -1;
}

/**
 * Extrae el valor de una celda Excel que puede ser:
 * - string/number directo
 * - { text: "E001", hyperlink: "..." } (hipervínculos)
 * - { richText: [...] }
 * - { formula: "...", result: ... }
 */
function getCellValue(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("text" in obj && obj.text !== undefined) return String(obj.text);
    if ("result" in obj && obj.result !== undefined) return obj.result as string | number;
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>)
        .map((t) => t.text ?? "")
        .join("");
    }
  }
  return String(value);
}

function parseDate(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (value instanceof Date) return value.toISOString().split("T")[0] || "";
  if (typeof value === "number") {
    // Excel serial date
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0] || "";
  }
  return String(value);
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,-]/g, "").replace(",", ".");
    return parseFloat(cleaned) || 0;
  }
  return 0;
}

export async function readComprobantesFromExcel(file: File): Promise<ComprobanteExcel[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No se encontró ninguna hoja en el archivo Excel");
  }

  const serieCol = findColumnIndex(worksheet, COLUMN_MAPPINGS.serie);
  const correlativoCol = findColumnIndex(worksheet, COLUMN_MAPPINGS.correlativo);
  const fechaCol = findColumnIndex(worksheet, COLUMN_MAPPINGS.fecha);
  const importeCol = findColumnIndex(worksheet, COLUMN_MAPPINGS.importe);
  const nroDocCol = findColumnIndex(worksheet, COLUMN_MAPPINGS.nroDocIdentidad);
  const razonSocialCol = findColumnIndex(worksheet, COLUMN_MAPPINGS.razonSocial);

  if (serieCol === -1 || correlativoCol === -1) {
    throw new Error(
      "No se encontraron las columnas requeridas. Asegúrese de que el Excel tenga 'Serie del CDP' (o 'Serie') y 'Nro CP o Doc. Nro Inicial (Rango)'"
    );
  }

  // Si serie y correlativo apuntan a la misma columna, usar lógica alternativa
  if (serieCol === correlativoCol) {
    throw new Error(
      "Las columnas 'Serie del CDP' y 'Nro CP o Doc. Nro Inicial (Rango)' deben ser diferentes"
    );
  }

  const comprobantes: ComprobanteExcel[] = [];
  const rowCount = worksheet.rowCount || 0;

  for (let row = 2; row <= rowCount; row++) {
    const rowData = worksheet.getRow(row);
    const serieVal = getCellValue(rowData.getCell(serieCol).value);
    const correlativoVal = getCellValue(rowData.getCell(correlativoCol).value);
    const serieRaw = String(serieVal ?? "").trim();
    const correlativoRaw = String(correlativoVal ?? "").trim();

    if (!serieRaw && !correlativoRaw) continue;

    const serie = serieRaw.replace(/^0+/, "") || "0";
    const correlativo = correlativoRaw.replace(/^0+/, "") || "0";
    const comprobante = normalizeComprobante(`${serie}-${correlativo}`);

    const fechaEmision = fechaCol !== -1 ? parseDate(getCellValue(rowData.getCell(fechaCol).value)) : "";
    const importeTotal = importeCol !== -1 ? parseNumber(getCellValue(rowData.getCell(importeCol).value)) : 0;
    const nroDocIdentidad = nroDocCol !== -1 ? String(getCellValue(rowData.getCell(nroDocCol).value)).trim() : "";
    const razonSocial = razonSocialCol !== -1 ? String(getCellValue(rowData.getCell(razonSocialCol).value)).trim() : "";

    comprobantes.push({
      serie,
      correlativo,
      comprobante,
      fechaEmision,
      importeTotal,
      nroDocIdentidad,
      razonSocial,
      rowIndex: row,
    });
  }

  return comprobantes;
}
