import ExcelJS from "exceljs";
import type { ResultadoVerificacion } from "./types";

export async function generateVerificationExcel(
  excelFile: File,
  resultados: ResultadoVerificacion[],
  comprobantesSoloEnPdf: Array<{ comprobante: string; pagina: number; fecha?: string; importe?: number }> = []
): Promise<Blob> {
  const arrayBuffer = await excelFile.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("No se encontró hoja en el Excel");

  // Encontrar la última columna
  const lastCol = worksheet.columnCount || 10;
  const headerRow = worksheet.getRow(1);

  // Agregar nuevas columnas si no existen
  const paginaCol = lastCol + 1;
  const estadoCol = lastCol + 2;
  const observacionCol = lastCol + 3;

  headerRow.getCell(paginaCol).value = "Pagina PDF";
  headerRow.getCell(estadoCol).value = "Estado";
  headerRow.getCell(observacionCol).value = "Observacion";

  // Crear mapa de comprobante a resultado
  const resultadoMap = new Map<string, ResultadoVerificacion>();
  resultados.forEach((r) => resultadoMap.set(r.comprobante, r));

  // Encontrar columna de serie (para colorear) - priorizar "Serie del CDP"
  let serieCol = -1;
  for (let c = 1; c <= 20; c++) {
    const val = headerRow.getCell(c).value?.toString() || "";
    if (val.toLowerCase().includes("serie del cdp") || val.toLowerCase().includes("serie")) {
      serieCol = c;
      break;
    }
  }
  if (serieCol === -1) {
    for (let c = 1; c <= 20; c++) {
      const val = headerRow.getCell(c).value?.toString() || "";
      if (val.toLowerCase().includes("nro cp") || val.toLowerCase().includes("doc. nro")) {
        serieCol = c;
        break;
      }
    }
  }
  if (serieCol === -1) serieCol = 1;

  // Rellenar datos
  resultados.forEach((resultado, idx) => {
    const rowNum = resultado.rowIndex;
    const row = worksheet.getRow(rowNum);

    row.getCell(paginaCol).value = resultado.paginaPdf ?? "";
    row.getCell(estadoCol).value = resultado.estado;
    row.getCell(observacionCol).value = resultado.observacion;

    // Colorear celda de serie
    const serieCell = row.getCell(serieCol);
    let fillColor: string;
    switch (resultado.estado) {
      case "CORRECTO":
        fillColor = "FF90EE90"; // Verde claro
        break;
      case "FECHA DIFERENTE":
      case "TOTAL DIFERENTE":
        fillColor = "FFFFFFE0"; // Amarillo claro
        break;
      case "NO ENCONTRADO":
      default:
        fillColor = "FFFFB6C1"; // Rojo claro
        break;
    }
    serieCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fillColor },
    };
  });

  // Hoja adicional: Comprobantes en PDF que no están en el Excel
  if (comprobantesSoloEnPdf.length > 0) {
    const sheetSoloPdf = workbook.addWorksheet("Solo en PDF", { state: "visible" });
    sheetSoloPdf.columns = [
      { header: "Comprobante", key: "comprobante", width: 15 },
      { header: "Pagina PDF", key: "pagina", width: 12 },
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "Importe", key: "importe", width: 12 },
      { header: "Observacion", key: "observacion", width: 30 },
    ];
    sheetSoloPdf.getRow(1).font = { bold: true };
    comprobantesSoloEnPdf.forEach((c) => {
      sheetSoloPdf.addRow({
        comprobante: c.comprobante,
        pagina: c.pagina,
        fecha: c.fecha ?? "",
        importe: c.importe ?? "",
        observacion: "Encontrado en PDF pero no está en el Excel",
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
