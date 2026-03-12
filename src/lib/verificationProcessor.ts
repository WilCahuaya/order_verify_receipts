"use client";

import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import { readComprobantesFromExcel } from "./excelReader";
import { extractComprobantesFromText, normalizeComprobante } from "./normalize";
import { extractFechas, extractImportes } from "./textExtractor";
import type {
  ComprobanteEncontrado,
  ComprobanteExcel,
  EstadoVerificacion,
  ResultadoVerificacion,
} from "./types";

// Configurar worker de pdfjs (unpkg para compatibilidad con Vercel/Next.js)
function initPdfWorker() {
  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
}

const TOLERANCIA_IMPORTE = 0.01; // 1 centavo de tolerancia

function fechasCoinciden(fecha1: string, fecha2: string): boolean {
  if (!fecha1 || !fecha2) return true; // Si no hay fecha para comparar, considerar OK
  const normalizar = (f: string) => f.replace(/\D/g, "");
  return normalizar(fecha1) === normalizar(fecha2);
}

function importesCoinciden(imp1: number, imp2: number): boolean {
  if (imp1 === 0 && imp2 === 0) return true;
  return Math.abs(imp1 - imp2) <= TOLERANCIA_IMPORTE;
}

export async function processVerification(
  excelFile: File,
  pdfFile: File,
  onProgress: (message: string, percent: number) => void
): Promise<ResultadoVerificacion[]> {
  onProgress("Leyendo archivo Excel...", 0);
  const comprobantesExcel = await readComprobantesFromExcel(excelFile);
  const comprobantesMap = new Map<string, ComprobanteExcel>();
  comprobantesExcel.forEach((c) => comprobantesMap.set(c.comprobante, c));

  initPdfWorker();
  onProgress("Cargando PDF...", 5);
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdfDoc.numPages;

  onProgress("Iniciando OCR (Tesseract)...", 10);
  const worker = await createWorker("spa", 1, {
    logger: () => {},
  });

  const comprobantesEncontrados = new Map<number, ComprobanteEncontrado[]>();

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const percent = 10 + Math.floor((pageNum / numPages) * 85);
    onProgress(`Procesando página ${pageNum} de ${numPages}...`, percent);

    let pageText = "";

    // Intentar primero extraer texto nativo del PDF (por si tiene texto)
    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const textItems = textContent.items
        .map((item: { str?: string }) => ("str" in item ? item.str : ""))
        .join(" ");
      if (textItems.trim().length > 20) {
        pageText = textItems;
      }
    } catch {
      // Ignorar, usaremos OCR
    }

    // Si no hay texto suficiente, usar OCR
    if (pageText.trim().length < 50) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      const imageData = canvas.toDataURL("image/png");
      const { data } = await worker.recognize(imageData);
      pageText = data.text;
    }

    const encontrados = extractComprobantesFromText(pageText);
    const fechas = extractFechas(pageText);
    const importes = extractImportes(pageText);

    for (const { normalized } of encontrados) {
      const comprobanteEncontrado: ComprobanteEncontrado = {
        comprobante: normalized,
        pagina: pageNum,
        fecha: fechas[0],
        importe: importes[0],
      };
      if (!comprobantesEncontrados.has(pageNum)) {
        comprobantesEncontrados.set(pageNum, []);
      }
      comprobantesEncontrados.get(pageNum)!.push(comprobanteEncontrado);
    }

    // Si no encontramos comprobantes con el regex estricto, buscar más variantes
    if (encontrados.length === 0) {
      const regex2 = /([A-Za-z]\d+)\s*[-–]\s*(\d+)/g;
      let m;
      while ((m = regex2.exec(pageText)) !== null) {
        const normalized = normalizeComprobante(`${m[1]}-${m[2]}`);
        if (!comprobantesEncontrados.has(pageNum)) {
          comprobantesEncontrados.set(pageNum, []);
        }
        const exists = comprobantesEncontrados.get(pageNum)!.some((c) => c.comprobante === normalized);
        if (!exists) {
          comprobantesEncontrados.get(pageNum)!.push({
            comprobante: normalized,
            pagina: pageNum,
            fecha: fechas[0],
            importe: importes[0],
          });
        }
      }
    }
  }

  await worker.terminate();
  pdfDoc.destroy();

  onProgress("Comparando resultados...", 98);

  // Construir mapa comprobante -> página
  const comprobanteToPage = new Map<string, ComprobanteEncontrado>();
  comprobantesEncontrados.forEach((lista, _page) => {
    lista.forEach((c) => {
      const existing = comprobanteToPage.get(c.comprobante);
      if (!existing || c.pagina < existing.pagina) {
        comprobanteToPage.set(c.comprobante, c);
      }
    });
  });

  const resultados: ResultadoVerificacion[] = comprobantesExcel.map((comp) => {
    const encontrado = comprobanteToPage.get(comp.comprobante);

    if (!encontrado) {
      return {
        ...comp,
        paginaPdf: null,
        estado: "NO ENCONTRADO" as EstadoVerificacion,
        observacion: "Comprobante no encontrado en el PDF",
      };
    }

    const fechaOk = fechasCoinciden(comp.fechaEmision, encontrado.fecha || "");
    const importeOk = importesCoinciden(comp.importeTotal, encontrado.importe || 0);

    let estado: EstadoVerificacion = "CORRECTO";
    let observacion = "";

    if (!fechaOk && !importeOk) {
      estado = "FECHA DIFERENTE";
      observacion = `Fecha: ${encontrado.fecha || "N/A"}, Total: ${encontrado.importe ?? "N/A"}`;
    } else if (!fechaOk) {
      estado = "FECHA DIFERENTE";
      observacion = `Fecha en PDF: ${encontrado.fecha || "N/A"}`;
    } else if (!importeOk) {
      estado = "TOTAL DIFERENTE";
      observacion = `Importe en PDF: ${encontrado.importe ?? "N/A"}`;
    } else {
      observacion = `Página ${encontrado.pagina}`;
    }

    return {
      ...comp,
      paginaPdf: encontrado.pagina,
      estado,
      observacion,
      fechaEncontrada: encontrado.fecha,
      importeEncontrado: encontrado.importe,
    };
  });

  onProgress("Completado", 100);
  return resultados;
}
