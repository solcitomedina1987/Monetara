import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { TransactionWithRelations, TransactionFilters } from "@/lib/types";

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

async function loadLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch("/logo-monetara.png");
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ============================================================
// PDF Export
// ============================================================
export async function exportToPDF(transactions: TransactionWithRelations[], filters?: TransactionFilters, filename?: string) {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // Try to embed logo
  const logoBase64 = await loadLogoBase64();
  const logoW = 22;
  const logoH = 22;
  const logoX = pageWidth - margin - logoW;
  const logoY = 8;
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", logoX, logoY, logoW, logoH);
  }

  // Header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Reporte de Movimientos", margin, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, margin, 28);
  doc.text(`Total de movimientos: ${transactions.length}`, margin, 34);

  const totalIngresos = transactions.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
  const totalGastos = transactions.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0);

  doc.text(`Ingresos: $${totalIngresos.toFixed(2)} | Gastos: $${totalGastos.toFixed(2)} | Balance: $${(totalIngresos - totalGastos).toFixed(2)}`, margin, 40);

  // Thin separator line under header
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, 45, pageWidth - margin, 45);

  // Table headers
  let y = 52;
  const colWidths = [28, 30, 35, 45, 40, 40, 50];
  const headers = ["Fecha", "Tipo", "Monto", "Cuenta", "Categoría", "Etiquetas", "Notas"];
  const colX = [margin];
  for (let i = 1; i < colWidths.length; i++) colX.push(colX[i - 1] + colWidths[i - 1]);

  doc.setFillColor(59, 130, 246);
  doc.rect(margin, y - 5, pageWidth - margin * 2, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  headers.forEach((h, i) => doc.text(h, colX[i] + 1, y));

  y += 6;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  transactions.forEach((t, idx) => {
    if (y > 185) {
      doc.addPage();
      y = 20;
    }

    if (idx % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(margin, y - 4, pageWidth - margin * 2, 7, "F");
    }

    const sign = t.tipo === "ingreso" ? "+" : t.tipo === "gasto" ? "-" : "";
    const row = [
      t.fecha,
      t.tipo.charAt(0).toUpperCase() + t.tipo.slice(1),
      `${sign}$${Number(t.monto).toFixed(2)}`,
      t.account?.nombre?.slice(0, 18) ?? "",
      t.category?.nombre?.slice(0, 16) ?? "",
      t.tags?.map((tg) => tg.nombre).join(", ").slice(0, 16) ?? "",
      (t.notas ?? "").slice(0, 22),
    ];

    // Color for tipo
    if (t.tipo === "ingreso") doc.setTextColor(22, 163, 74);
    else if (t.tipo === "gasto") doc.setTextColor(220, 38, 38);
    else doc.setTextColor(37, 99, 235);

    doc.text(row[0], colX[0] + 1, y);
    doc.text(row[1], colX[1] + 1, y);
    doc.text(row[2], colX[2] + 1, y);
    doc.setTextColor(0, 0, 0);
    row.slice(3).forEach((cell, i) => doc.text(cell, colX[i + 3] + 1, y));

    y += 7;
  });

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
