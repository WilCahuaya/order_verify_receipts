import { VerificationProcessor } from "@/components/VerificationProcessor";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100">
      <div className="container mx-auto px-4 py-12">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">
            Verificador de Comprobantes
          </h1>
          <p className="text-slate-600 max-w-xl mx-auto">
            Compara comprobantes de un archivo Excel con un PDF escaneado usando OCR.
            Sube tu Excel y PDF para verificar que todos los comprobantes estén presentes.
          </p>
        </header>
        <VerificationProcessor />
      </div>
    </div>
  );
}
