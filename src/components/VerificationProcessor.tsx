"use client";

import { useState } from "react";
import { FileUpload } from "./FileUpload";
import { processVerification } from "@/lib/verificationProcessor";
import { generateVerificationExcel } from "@/lib/excelGenerator";
import type { ResultadoVerificacion } from "@/lib/types";

export function VerificationProcessor() {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ message: "", percent: 0 });
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoVerificacion[] | null>(null);

  const handleProcess = async () => {
    if (!excelFile || !pdfFile) {
      setError("Por favor suba ambos archivos (Excel y PDF)");
      return;
    }

    setError(null);
    setResultados(null);
    setProcessing(true);

    try {
      const results = await processVerification(
        excelFile,
        pdfFile,
        (message, percent) => setProgress({ message, percent })
      );
      setResultados(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar");
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!excelFile || !resultados) return;

    try {
      const blob = await generateVerificationExcel(excelFile, resultados);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "verificacion_comprobantes.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar Excel");
    }
  };

  const correctos = resultados?.filter((r) => r.estado === "CORRECTO").length ?? 0;
  const conDiferencias = resultados?.filter(
    (r) => r.estado === "FECHA DIFERENTE" || r.estado === "TOTAL DIFERENTE"
  ).length ?? 0;
  const noEncontrados = resultados?.filter((r) => r.estado === "NO ENCONTRADO").length ?? 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">
          Verificación de Comprobantes
        </h2>

        <div className="space-y-6">
          <FileUpload
            label="Archivo Excel con comprobantes"
            accept=".xlsx,.xls"
            file={excelFile}
            onFileChange={setExcelFile}
            disabled={processing}
          />
          <FileUpload
            label="Archivo PDF escaneado"
            accept=".pdf"
            file={pdfFile}
            onFileChange={setPdfFile}
            disabled={processing}
          />

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {processing && (
            <div className="space-y-2">
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="text-sm text-slate-600">{progress.message}</p>
            </div>
          )}

          <button
            onClick={handleProcess}
            disabled={processing || !excelFile || !pdfFile}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Procesando..." : "Verificar Comprobantes"}
          </button>
        </div>
      </div>

      {resultados && (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Resultados</h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg bg-green-50 p-4 border border-green-200">
              <p className="text-2xl font-bold text-green-700">{correctos}</p>
              <p className="text-sm text-green-600">Correctos</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-4 border border-amber-200">
              <p className="text-2xl font-bold text-amber-700">{conDiferencias}</p>
              <p className="text-sm text-amber-600">Con diferencias</p>
            </div>
            <div className="rounded-lg bg-red-50 p-4 border border-red-200">
              <p className="text-2xl font-bold text-red-700">{noEncontrados}</p>
              <p className="text-sm text-red-600">No encontrados</p>
            </div>
          </div>

          <button
            onClick={handleDownload}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
          >
            Descargar verificacion_comprobantes.xlsx
          </button>
        </div>
      )}
    </div>
  );
}
