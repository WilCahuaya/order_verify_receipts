export interface ComprobanteExcel {
  serie: string;
  correlativo: string;
  comprobante: string; // SERIE-CORRELATIVO normalizado
  fechaEmision: string;
  importeTotal: number;
  rowIndex: number;
}

export type EstadoVerificacion = "CORRECTO" | "FECHA DIFERENTE" | "TOTAL DIFERENTE" | "NO ENCONTRADO";

export interface ResultadoVerificacion extends ComprobanteExcel {
  paginaPdf: number | null;
  estado: EstadoVerificacion;
  observacion: string;
  fechaEncontrada?: string;
  importeEncontrado?: number;
}

export interface ComprobanteEncontrado {
  comprobante: string;
  pagina: number;
  fecha?: string;
  importe?: number;
}
