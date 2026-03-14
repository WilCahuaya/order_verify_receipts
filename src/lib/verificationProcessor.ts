"use client";

import * as pdfjsLib from "pdfjs-dist";
import { createWorker, PSM } from "tesseract.js";
import { readComprobantesFromExcel } from "./excelReader";
import { extractComprobantesFromText, normalizeComprobante } from "./normalize";
import {
  extractFechas,
  extractImportes,
  extractImporteTotal,
  extractRuc,
  extractRazonSocial,
  extractComprobanteFromLabels,
} from "./textExtractor";
import type {
  ComprobanteEncontrado,
  ComprobanteExcel,
  EstadoVerificacion,
  ResultadoVerificacion,
  ResultadoVerificacionCompleto,
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
): Promise<ResultadoVerificacionCompleto> {
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
  const worker = await createWorker("spa+eng", 1, {
    logger: () => {},
  });
  // PSM 4 = columna única, mejor para facturas/boletas
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });

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
        .map((item) => ("str" in item ? (item as { str: string }).str : ""))
        .join(" ");
      if (textItems.trim().length > 10) {
        pageText = textItems;
      }
    } catch {
      // Ignorar, usaremos OCR
    }

    // Si no hay texto suficiente, usar OCR (scale 4 = ~300 DPI para mejor precisión)
    if (pageText.trim().length < 30) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 4 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({
        canvasContext: context,
        canvas,
        viewport,
      }).promise;

      const imageData = canvas.toDataURL("image/png");
      const { data } = await worker.recognize(imageData);
      pageText = data.text;

      // Si no encontramos comprobantes con PSM 4, intentar PSM 6 (bloque único)
      let encontradosPrimera = extractComprobantesFromText(pageText);
      if (encontradosPrimera.length === 0) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
        const { data: data2 } = await worker.recognize(imageData);
        const pageText2 = data2.text;
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
        const encontrados2 = extractComprobantesFromText(pageText2);
        if (encontrados2.length > 0) pageText = pageText2;
      }
    }

    // 1. Intentar extracción por etiquetas (Serie del CDP, Nro CP, Total CP)
    const porEtiquetas = extractComprobanteFromLabels(pageText);
    const importeTotal = extractImporteTotal(pageText);
    const fechas = extractFechas(pageText);
    const importes = extractImportes(pageText);
    const importeFinal = importeTotal || importes[0];
    const ruc = extractRuc(pageText);
    const razonSocial = extractRazonSocial(pageText);

    let encontrados = extractComprobantesFromText(pageText);

    // Si las etiquetas encontraron Serie + Correlativo, priorizar ese comprobante
    if (porEtiquetas) {
      const compEtiqueta = normalizeComprobante(`${porEtiquetas.serie}-${porEtiquetas.correlativo}`);
      const yaExiste = encontrados.some((e) => e.normalized === compEtiqueta);
      if (!yaExiste) {
        encontrados = [{ comprobante: compEtiqueta, normalized: compEtiqueta }, ...encontrados];
      }
    }

    for (const { normalized } of encontrados) {
      const comprobanteEncontrado: ComprobanteEncontrado = {
        comprobante: normalized,
        pagina: pageNum,
        fecha: fechas[0],
        importe: importeFinal,
        ruc: ruc || undefined,
        razonSocial: razonSocial || undefined,
      };
      if (!comprobantesEncontrados.has(pageNum)) {
        comprobantesEncontrados.set(pageNum, []);
      }
      comprobantesEncontrados.get(pageNum)!.push(comprobanteEncontrado);
    }

    // Fallback: patrones estrictos (solo E/F/B, correlativo 2-6 dígitos)
    if (encontrados.length === 0) {
      const fallbackPatterns = [
        /([EFBefb][0-9]{2,4})\s*[-]?\s*(\d{2,6})/g,
        /\b([EFBefb][A-Za-z]?0*[0-9]+)\s+(\d{2,6})\b/g,
      ];
      for (const regex of fallbackPatterns) {
        let m;
        while ((m = regex.exec(pageText)) !== null) {
          const corr = m[2];
          if (corr.length >= 8 || parseInt(corr, 10) === 0) continue;
          const normalized = normalizeComprobante(`${m[1]}-${corr}`);
          if (!comprobantesEncontrados.has(pageNum)) {
            comprobantesEncontrados.set(pageNum, []);
          }
          const exists = comprobantesEncontrados.get(pageNum)!.some((c) => c.comprobante === normalized);
          if (!exists) {
            comprobantesEncontrados.get(pageNum)!.push({
              comprobante: normalized,
              pagina: pageNum,
              fecha: fechas[0],
              importe: importeFinal,
              ruc: ruc || undefined,
              razonSocial: razonSocial || undefined,
            });
          }
        }
      }
    }
  }

  await worker.terminate();
  pdfDoc.destroy();

  onProgress("Comparando resultados...", 98);

  // Lista plana de todos los comprobantes encontrados en PDF (puede haber duplicados por proveedor)
  const todosEncontrados: ComprobanteEncontrado[] = [];
  comprobantesEncontrados.forEach((lista) => lista.forEach((c) => todosEncontrados.push(c)));

  function rucCoincide(rucPdf: string | undefined, rucExcel: string): boolean {
    if (!rucExcel) return true;
    if (!rucPdf) return false;
    return rucPdf === rucExcel || rucPdf.endsWith(rucExcel) || rucExcel.endsWith(rucPdf);
  }

  function razonSocialCoincide(razonPdf: string | undefined, razonExcel: string): boolean {
    if (!razonExcel) return true;
    if (!razonPdf) return false;
    const pdfNorm = razonPdf.toLowerCase().replace(/\s+/g, " ").trim();
    const excelNorm = razonExcel.toLowerCase().replace(/\s+/g, " ").trim();
    return pdfNorm.includes(excelNorm) || excelNorm.includes(pdfNorm);
  }

  const pdfUsados = new Set<ComprobanteEncontrado>();

  function encontrarMejorMatch(comp: ComprobanteExcel): ComprobanteEncontrado | undefined {
    const candidatos = todosEncontrados.filter(
      (c) =>
        !pdfUsados.has(c) &&
        (c.comprobante === comp.comprobante ||
          (comp.correlativo && c.comprobante.endsWith(`-${comp.correlativo}`)))
    );
    if (candidatos.length === 0) return undefined;
    if (candidatos.length === 1) {
      pdfUsados.add(candidatos[0]);
      return candidatos[0];
    }

    // Hay duplicados: priorizar por Nro Doc Identidad y Razón Social
    const conRuc = candidatos.filter((c) => rucCoincide(c.ruc, comp.nroDocIdentidad));
    const conRazon = candidatos.filter((c) => razonSocialCoincide(c.razonSocial, comp.razonSocial));
    const conAmbos = conRuc.filter((c) => razonSocialCoincide(c.razonSocial, comp.razonSocial));

    const elegido = conAmbos[0] || conRuc[0] || conRazon[0] || candidatos[0];
    pdfUsados.add(elegido);
    return elegido;
  }

  // Comprobantes en PDF que no están en Excel (únicos por comprobante)
  const comprobantesExcelSet = new Set(comprobantesExcel.map((c) => c.comprobante));
  const comprobantesSoloEnPdf: ResultadoVerificacionCompleto["comprobantesSoloEnPdf"] = [];
  const seenSolo = new Set<string>();
  todosEncontrados.forEach((c) => {
    if (!comprobantesExcelSet.has(c.comprobante) && !seenSolo.has(c.comprobante)) {
      seenSolo.add(c.comprobante);
      comprobantesSoloEnPdf.push({
        comprobante: c.comprobante,
        pagina: c.pagina,
        fecha: c.fecha,
        importe: c.importe,
      });
    }
  });
  comprobantesSoloEnPdf.sort((a, b) => a.pagina - b.pagina);

  const resultados: ResultadoVerificacion[] = comprobantesExcel.map((comp) => {
    const encontrado = encontrarMejorMatch(comp);

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
  return { resultados, comprobantesSoloEnPdf };
}
