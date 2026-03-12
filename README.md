# Verificador de Comprobantes

Aplicación web para verificar comprobantes escaneados comparándolos con un archivo Excel.

## Tecnologías

- **Next.js** - Framework React
- **TypeScript** - Tipado estático
- **Tesseract.js** - OCR para extraer texto de imágenes
- **pdfjs-dist** - Lectura y renderizado de PDF
- **ExcelJS** - Lectura y escritura de archivos Excel

## Requisitos del Excel

El archivo Excel debe contener las siguientes columnas (los nombres pueden variar ligeramente):

| Columna en Excel | Uso |
|------------------|-----|
| Nro CP o Doc. Nro Inicial (Rango) | Serie del comprobante |
| Tipo Doc Identidad | Correlativo |
| Fecha Emision Doc | Fecha de emisión |
| Tipo de Cambio / Importe Total | Importe total |

El comprobante se reconstruye como **SERIE-CORRELATIVO** (ej: E001-447, F005-127).

## Formato de comprobantes en el PDF

El sistema detecta comprobantes en diversos formatos y los normaliza:

- `E001-447`
- `E001 - 447`
- `E001-000447`
- `E0001 - 00000447`

Todos se normalizan a: `E1-447` (eliminando ceros a la izquierda y espacios).

## Estados de verificación

- **CORRECTO** - Comprobante encontrado con fecha e importe coincidentes
- **FECHA DIFERENTE** - Comprobante encontrado pero la fecha no coincide
- **TOTAL DIFERENTE** - Comprobante encontrado pero el importe no coincide
- **NO ENCONTRADO** - Comprobante no encontrado en el PDF

## Instalación

```bash
npm install
```

## Ejecución

```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

Abrir [http://localhost:3000](http://localhost:3000) en el navegador.

## Uso

1. Subir el archivo Excel con los comprobantes
2. Subir el archivo PDF escaneado (200-300 páginas)
3. Clic en "Verificar Comprobantes"
4. Esperar el procesamiento (OCR puede tardar varios minutos)
5. Descargar `verificacion_comprobantes.xlsx` con los resultados

El archivo de salida incluye las columnas originales más:
- **Pagina PDF** - Número de página donde se encontró
- **Estado** - CORRECTO, FECHA DIFERENTE, TOTAL DIFERENTE o NO ENCONTRADO
- **Observacion** - Detalles adicionales

La columna de serie se colorea:
- **Verde** - Encontrado correctamente
- **Amarillo** - Encontrado con diferencias
- **Rojo** - No encontrado

## Despliegue en Vercel

### Opción 1: Desde el dashboard (recomendado)

1. Sube el proyecto a **GitHub**, **GitLab** o **Bitbucket**
2. Ve a [vercel.com](https://vercel.com) e inicia sesión
3. Clic en **"Add New"** → **"Project"**
4. Importa tu repositorio
5. Vercel detectará Next.js automáticamente
6. Clic en **"Deploy"**

### Opción 2: Con Vercel CLI

```bash
# Instalar CLI
npm i -g vercel

# Iniciar sesión
vercel login

# Desplegar (desde la raíz del proyecto)
vercel        # Preview
vercel --prod # Producción
```

## Notas

- Todo el procesamiento se realiza en el navegador (sin base de datos ni servidor)
- Para PDFs grandes, el proceso puede tardar varios minutos
- Tesseract.js descarga los datos de idioma español en la primera ejecución
