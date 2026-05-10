import type { CellInput } from "jspdf-autotable";
import { format, parseISO, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { es } from "date-fns/locale";
import type { TransactionWithRelations, TransactionFilters, DashboardPeriod } from "@/lib/types";
import { CURRENCIES } from "@/lib/types";

function formatAmount(monto: number, tipo: string): string {
  const sign = tipo === "ingreso" ? "+" : tipo === "gasto" ? "-" : "";
  return `${sign}${Number(monto).toFixed(2)}`;
}

// ============================================================
// CSV Export
// ============================================================
export function exportToCSV(transactions: TransactionWithRelations[], filename?: string) {
  const headers = ["Fecha", "Tipo", "Monto", "Cuenta", "Categoría", "Etiquetas", "Cuenta Destino", "Notas"];

  const rows = transactions.map((t) => [
    t.fecha,
    t.tipo,
    formatAmount(t.monto, t.tipo),
    t.account?.nombre ?? "",
    t.category?.nombre ?? "",
    t.tags?.map((tag) => tag.nombre).join("; ") ?? "",
    t.to_account?.nombre ?? "",
    t.notas ?? "",
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename ?? `movimientos_${format(new Date(), "yyyy-MM-dd")}.csv`);
}

// ============================================================
// Excel Export (XLSX)
// ============================================================
export async function exportToExcel(transactions: TransactionWithRelations[], filename?: string) {
  const XLSX = (await import("xlsx")).default;

  const data = transactions.map((t) => ({
    Fecha: t.fecha,
    Tipo: t.tipo.charAt(0).toUpperCase() + t.tipo.slice(1),
    Monto: Number(t.monto),
    "Ingreso/Gasto": t.tipo === "ingreso" ? Number(t.monto) : t.tipo === "gasto" ? -Number(t.monto) : 0,
    Cuenta: t.account?.nombre ?? "",
    Categoría: t.category?.nombre ?? "",
    Etiquetas: t.tags?.map((tag) => tag.nombre).join(", ") ?? "",
    "Cuenta Destino": t.to_account?.nombre ?? "",
    Notas: t.notas ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(data);

  // Column widths
  ws["!cols"] = [
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 30 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Movimientos");

  // Summary sheet
  const totalIngresos = transactions.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
  const totalGastos = transactions.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0);

  const summary = [
    { Concepto: "Total Ingresos", Monto: totalIngresos },
    { Concepto: "Total Gastos", Monto: totalGastos },
    { Concepto: "Balance", Monto: totalIngresos - totalGastos },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");

  XLSX.writeFile(wb, filename ?? `movimientos_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

function currencySymbolForCode(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? "$";
}

/** Misma lógica que en server actions (solo fechas; usable en cliente). */
function getExportPeriodRange(filters?: TransactionFilters): [string, string] | null {
  const now = new Date();
  const periodo = filters?.periodo ?? "mes_actual";

  if (periodo === "mes_actual") {
    return [format(startOfMonth(now), "yyyy-MM-dd"), format(endOfMonth(now), "yyyy-MM-dd")];
  }
  if (periodo === "mes_anterior") {
    const last = subMonths(now, 1);
    return [format(startOfMonth(last), "yyyy-MM-dd"), format(endOfMonth(last), "yyyy-MM-dd")];
  }
  if (periodo === "ultimos_3_meses") {
    return [format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"), format(endOfMonth(now), "yyyy-MM-dd")];
  }
  if (periodo === "año_actual") {
    return [format(startOfYear(now), "yyyy-MM-dd"), format(endOfMonth(now), "yyyy-MM-dd")];
  }
  if (periodo === "ultimo_año") {
    return [format(subMonths(now, 12), "yyyy-MM-dd"), format(now, "yyyy-MM-dd")];
  }
  if (periodo === "personalizado" && filters?.fechaDesde && filters?.fechaHasta) {
    return [filters.fechaDesde, filters.fechaHasta];
  }
  return null;
}

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  mes_actual: "Mes actual",
  mes_anterior: "Mes anterior",
  ultimos_3_meses: "Últimos 3 meses",
  año_actual: "Año actual",
  ultimo_año: "Último año",
  personalizado: "Período personalizado",
};

function formatPeriodReportTitle(filters?: TransactionFilters): string {
  const periodo = filters?.periodo ?? "mes_actual";
  const range = getExportPeriodRange(filters);
  const label = PERIOD_LABELS[periodo as DashboardPeriod] ?? "Período";

  if (range) {
    const [a, b] = range;
    try {
      const da = format(parseISO(a), "dd/MM/yyyy", { locale: es });
      const db = format(parseISO(b), "dd/MM/yyyy", { locale: es });
      return `${label}: ${da} – ${db}`;
    } catch {
      return `${label}: ${a} – ${b}`;
    }
  }
  return label;
}

function describeIncludedAccounts(filters: TransactionFilters | undefined, txs: TransactionWithRelations[]): string {
  if (filters?.account_id) {
    const row = txs.find((t) => t.account_id === filters.account_id);
    return row?.account?.nombre ?? "Cuenta seleccionada";
  }
  const map = new Map<string, string>();
  for (const t of txs) {
    const name = t.account?.nombre?.trim();
    if (name) map.set(t.account_id, name);
  }
  const names = [...map.entries()]
    .sort((x, y) => x[1].localeCompare(y[1], "es"))
    .map(([, n]) => n);
  if (names.length === 0) return "Sin cuentas en el listado";
  return names.join(", ");
}

function groupTransactionsByAccount(txs: TransactionWithRelations[]): Record<string, TransactionWithRelations[]> {
  return txs.reduce<Record<string, TransactionWithRelations[]>>((acc, t) => {
    const id = t.account_id;
    if (!acc[id]) acc[id] = [];
    acc[id].push(t);
    return acc;
  }, {});
}

function sortTxsChronologicalAsc(list: TransactionWithRelations[]): TransactionWithRelations[] {
  return [...list].sort((a, b) => {
    const df = a.fecha.localeCompare(b.fecha);
    if (df !== 0) return df;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

function abbreviateAccountName(nombre: string): string {
  const t = nombre.trim();
  if (!t) return "—";
  if (t.length <= 4) return t;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .map((p) => p[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }
  return t.slice(0, 3).toUpperCase();
}

function categoryCellForPdf(t: TransactionWithRelations): string {
  if (t.tipo === "transferencia" && t.to_account?.nombre) {
    return `Transferencia → ${t.to_account.nombre}`;
  }
  if (t.to_account_id && t.to_account?.nombre) {
    if (t.tipo === "gasto") return `Transferencia → ${t.to_account.nombre}`;
    if (t.tipo === "ingreso") return `Transferencia ← ${t.to_account.nombre}`;
  }
  return t.category?.nombre?.trim() || "—";
}

function formatMontoCell(t: TransactionWithRelations, symbol: string): string {
  const m = Number(t.monto);
  if (Number.isNaN(m)) return `${symbol} —`;
  const abs = Math.abs(m).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (t.tipo === "ingreso") return `${symbol} +${abs}`;
  if (t.tipo === "gasto") return `${symbol} −${abs}`;
  if (t.tipo === "transferencia") return `${symbol} ${abs}`;
  return `${symbol} ${abs}`;
}

function subtotalIngresosForAccount(txs: TransactionWithRelations[]): number {
  return txs.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
}

function subtotalGastosForAccount(txs: TransactionWithRelations[]): number {
  return txs.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0);
}

type ImageData = { format: "PNG" | "JPEG"; dataUrl: string };

async function fetchImageDataUrl(url: string): Promise<ImageData | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const mime = blob.type.toLowerCase();

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(blob);
    });

    if (mime.includes("jpeg") || mime.includes("jpg")) return { format: "JPEG", dataUrl };
    if (mime.includes("png")) return { format: "PNG", dataUrl };
    if (dataUrl.startsWith("data:image/jpeg")) return { format: "JPEG", dataUrl };
    if (dataUrl.startsWith("data:image/png")) return { format: "PNG", dataUrl };
    return null;
  } catch {
    return null;
  }
}

async function buildAccountIconCache(txs: TransactionWithRelations[]): Promise<Map<string, ImageData | null>> {
  const byUrl = new Map<string, ImageData | null>();
  const urls = new Set<string>();
  for (const t of txs) {
    const u = t.account?.icon_url;
    if (u) urls.add(u);
  }
  await Promise.all(
    [...urls].map(async (url) => {
      const img = await fetchImageDataUrl(url);
      byUrl.set(url, img);
    })
  );

  const byAccountId = new Map<string, ImageData | null>();
  for (const t of txs) {
    const id = t.account_id;
    const u = t.account?.icon_url;
    if (!byAccountId.has(id)) {
      byAccountId.set(id, u ? byUrl.get(u) ?? null : null);
    }
  }
  return byAccountId;
}

// ============================================================
// PDF Export
// ============================================================
export async function exportToPDF(
  transactions: TransactionWithRelations[],
  filters?: TransactionFilters,
  filename?: string
) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const grayHead: [number, number, number] = [55, 55, 55];
  const grayLine: [number, number, number] = [190, 190, 190];
  const grayAlt: [number, number, number] = [246, 246, 246];

  if (transactions.length === 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text("Movimientos", margin, margin + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("No hay movimientos para exportar con los filtros actuales.", margin, margin + 16);
    doc.save(filename ?? `movimientos_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    return;
  }

  const grouped = groupTransactionsByAccount(transactions);
  const accountIdsSorted = Object.keys(grouped).sort((a, b) => {
    const na = grouped[a][0]?.account?.nombre ?? "";
    const nb = grouped[b][0]?.account?.nombre ?? "";
    return na.localeCompare(nb, "es");
  });

  const iconByAccountId = await buildAccountIconCache(transactions);

  let cursorY = margin;

  const drawCoverHeader = () => {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(28, 28, 28);
    doc.text("Movimientos", margin, cursorY + 5);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(45, 45, 45);
    cursorY += 11;
    doc.text(formatPeriodReportTitle(filters), margin, cursorY);

    cursorY += 6;
    const accountsLine = describeIncludedAccounts(filters, transactions);
    const wrapped = doc.splitTextToSize(`Cuentas incluidas: ${accountsLine}`, contentWidth);
    doc.text(wrapped, margin, cursorY);
    cursorY += wrapped.length * 5 + 4;

    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, margin, cursorY);
    cursorY += 5;

    doc.setDrawColor(...grayLine);
    doc.setLineWidth(0.2);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 6;
  };

  for (let ai = 0; ai < accountIdsSorted.length; ai++) {
    const accountId = accountIdsSorted[ai];
    const rawList = grouped[accountId];
    const sortedTxs = sortTxsChronologicalAsc(rawList);
    const accountName = sortedTxs[0]?.account?.nombre ?? "Cuenta";
    const moneda = sortedTxs[0]?.account?.moneda ?? "ARS";
    const sym = currencySymbolForCode(moneda);

    if (ai === 0) {
      drawCoverHeader();
    } else {
      doc.addPage();
      cursorY = margin;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(accountName, margin, cursorY + 4);
    cursorY += 9;

    const body: CellInput[][] = [];
    const iconSlotForRow: (ImageData | "abbr" | null)[] = [];

    for (const t of sortedTxs) {
      const fechaStr = (() => {
        try {
          return format(parseISO(t.fecha), "dd/MM/yyyy", { locale: es });
        } catch {
          return t.fecha;
        }
      })();

      const img = iconByAccountId.get(accountId) ?? null;
      const abbr = abbreviateAccountName(t.account?.nombre ?? "");

      if (img) {
        body.push([
          fechaStr,
          "",
          categoryCellForPdf(t),
          t.notas?.trim() ? `Nota: ${t.notas.trim()}` : "Nota: —",
          formatMontoCell(t, sym),
        ]);
        iconSlotForRow.push(img);
      } else {
        body.push([
          fechaStr,
          abbr,
          categoryCellForPdf(t),
          t.notas?.trim() ? `Nota: ${t.notas.trim()}` : "Nota: —",
          formatMontoCell(t, sym),
        ]);
        iconSlotForRow.push("abbr");
      }
    }

    const ing = subtotalIngresosForAccount(sortedTxs);
    const gas = subtotalGastosForAccount(sortedTxs);
    const total = Number((ing - gas).toFixed(2));

    const money = (n: number) =>
      `${sym} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    body.push([
      { content: "", colSpan: 3 },
      { content: "Subtotal Ingresos", styles: { halign: "right", fontStyle: "normal", textColor: [40, 40, 40] } },
      { content: money(ing), styles: { halign: "right", fontStyle: "normal", textColor: [40, 40, 40] } },
    ]);
    iconSlotForRow.push(null);

    body.push([
      { content: "", colSpan: 3 },
      { content: "Subtotal Gastos", styles: { halign: "right", fontStyle: "normal", textColor: [40, 40, 40] } },
      { content: money(gas), styles: { halign: "right", fontStyle: "normal", textColor: [40, 40, 40] } },
    ]);
    iconSlotForRow.push(null);

    body.push([
      { content: "", colSpan: 3 },
      { content: "Total", styles: { halign: "right", fontStyle: "bold", textColor: [20, 20, 20] } },
      { content: money(total), styles: { halign: "right", fontStyle: "bold", textColor: [20, 20, 20] } },
    ]);
    iconSlotForRow.push(null);

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin, bottom: margin },
      showHead: "everyPage",
      tableWidth: contentWidth,
      head: [["Fecha", "Icono cuenta", "Categoría", "Notas", "Monto"]],
      body,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        textColor: [35, 35, 35],
        lineColor: grayLine,
        lineWidth: 0.1,
        cellPadding: 2,
        valign: "middle",
      },
      headStyles: {
        fillColor: grayHead,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 22, halign: "center" },
        1: { cellWidth: 18, halign: "center" },
        2: { cellWidth: 44 },
        3: { cellWidth: "auto" },
        4: { cellWidth: 32, halign: "right", fontStyle: "normal" },
      },
      alternateRowStyles: {
        fillColor: grayAlt,
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        if (data.row.index >= sortedTxs.length) {
          data.cell.styles.fillColor = [255, 255, 255];
        }
      },
      didDrawCell: (data) => {
        if (data.section !== "body") return;
        const idx = data.row.index;
        if (idx < 0 || idx >= sortedTxs.length) return;
        if (data.column.index !== 1) return;

        const slot = iconSlotForRow[idx];
        if (!slot || slot === "abbr") return;

        const cell = data.cell;
        const size = Math.min(cell.width - 2, cell.height - 2, 5);
        if (size <= 1) return;

        try {
          doc.addImage(
            slot.dataUrl,
            slot.format,
            cell.x + (cell.width - size) / 2,
            cell.y + (cell.height - size) / 2,
            size,
            size
          );
        } catch {
          /* imagen no válida para jsPDF */
        }
      },
    });

    const docExt = doc as { lastAutoTable?: { finalY: number } };
    cursorY = (docExt.lastAutoTable?.finalY ?? cursorY) + 12;
  }

  doc.save(filename ?? `movimientos_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
