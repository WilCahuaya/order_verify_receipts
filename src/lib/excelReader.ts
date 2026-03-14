import ExcelJS from "exceljs";
import { normalizeComprobante } from "./normalize";
import type { ComprobanteExcel } from "./types";

const COLUMN_MAPPINGS = {
  serie: [
    "Serie del CDP",
    "Serie",
    "Nro CP o Doc. Nro Inicial (Rango)",
    "serie",
  ],
  correlativo: [
    "Nro CP o Doc. Nro Inicial (Rango)",
    "Nro Final (Rango)",
    "Correlativo",
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
    "Importe Total",
    "importe total",
    "Total",
    "Tipo de Cambio",
    "Valor Adq. NG",
    "BI Gravado DNG",
    "Total Ventas",
  ],
};

function findColumnIndex(worksheet: ExcelJS.Worksheet, possibleNames: string[]): number {
  const firstRow = worksheet.getRow(1);
  if (!firstRow) return -1;

  for (let col = 1; col <= 100; col++) {
    const cell = firstRow.getCell(col);
    const value = cell.value?.toString()?.trim() || "";
    if (possibleNames.some((name) => value.toLowerCase().includes(name.toLowerCase()))) {
      return col;
    }
  }
  return -1;
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
    const serieRaw = rowData.getCell(serieCol).value?.toString()?.trim() || "";
    const correlativoRaw = rowData.getCell(correlativoCol).value?.toString()?.trim() || "";

    if (!serieRaw && !correlativoRaw) continue;

    const serie = serieRaw.replace(/^0+/, "") || "0";
    const correlativo = correlativoRaw.replace(/^0+/, "") || "0";
    const comprobante = normalizeComprobante(`${serie}-${correlativo}`);

    const fechaEmision = fechaCol !== -1 ? parseDate(rowData.getCell(fechaCol).value) : "";
    const importeTotal = importeCol !== -1 ? parseNumber(rowData.getCell(importeCol).value) : 0;

    comprobantes.push({
      serie,
      correlativo,
      comprobante,
      fechaEmision,
      importeTotal,
      rowIndex: row,
    });
  }

  return comprobantes;
}
