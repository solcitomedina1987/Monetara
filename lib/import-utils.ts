import { parse, isValid, format } from "date-fns";

/** Normaliza una fecha de cualquier origen a "YYYY-MM-DD". Soporta:
 *  - Número serial de Excel
 *  - Objeto Date
 *  - Strings: DD/MM/YYYY, D/M/YY, YYYY-MM-DD, DD-MM-YYYY
 */
export function parseImportDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return isValid(value) ? format(value, "yyyy-MM-dd") : null;
  }

  if (typeof value === "number") {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isValid(d) ? format(d, "yyyy-MM-dd") : null;
  }

  const s = String(value).trim();
  if (!s) return null;

  const formats = [
    "dd/MM/yyyy",
    "d/M/yyyy",
    "d/M/yy",
    "dd-MM-yyyy",
    "yyyy-MM-dd",
    "MM/dd/yyyy",
  ];
  for (const fmt of formats) {
    const d = parse(s, fmt, new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd");
  }
  return null;
}

/** Parsea montos: soporta formato argentino (1.234,56), US (1,234.56) y simple. */
export function parseImportAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Math.abs(value);

  const s = String(value).trim().replace(/[$\s]/g, "");
  if (!s) return null;

  let clean = s;
  const hasDot   = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    const lastDot   = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    clean = lastComma > lastDot
      ? s.replace(/\./g, "").replace(",", ".")   // Argentino: 1.234,56
      : s.replace(/,/g, "");                       // US: 1,234.56
  } else if (hasComma && !hasDot) {
    clean = s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length === 3) {
      clean = s.replace(".", ""); // punto como miles: 1.234
    }
  }

  const n = parseFloat(clean);
  return isNaN(n) ? null : Math.abs(n);
}
