"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type ElementType } from "react";
import * as LucideIcons from "lucide-react";
import {
  FolderOpen,
  LineChart as LineChartIcon,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getTransactions } from "@/app/actions/transactions";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { isValidTransactionPeriod } from "@/lib/analysis-period";
import { buildAnalysisMatrix, type VariacionMesPar } from "@/lib/analysis-matrix";
import {
  buildFinancialAiPayload,
  buildMonthlyChartSeries,
  generateStatisticalInsightsMarkdown,
} from "@/lib/financial-analysis-summary";
import type {
  Account,
  Category,
  Tag,
  TransactionFilters,
  TransactionPeriod,
  TransactionWithRelations,
} from "@/lib/types";

function DynamicCategoryIcon({ iconName, className }: { iconName: string | null | undefined; className?: string }) {
  const cls = className ?? "h-3.5 w-3.5";
  if (!iconName) return <FolderOpen className={cls} />;
  const IconComponent = (LucideIcons as unknown as Record<string, ElementType<{ className?: string }>>)[iconName];
  if (!IconComponent) return <FolderOpen className={cls} />;
  return <IconComponent className={cls} />;
}

const ANALYSIS_FILTER_KEY = "monetara_analysis_filters";

const DEFAULT_ANALYSIS_FILTERS: TransactionFilters = {
  periodo: "ultimo_año",
  showIngresos: true,
  showGastos: true,
};

const VALID_PERIODS = new Set<string>([
  "mes_actual",
  "mes_anterior",
  "ultimos_3_meses",
  "año_actual",
  "ultimo_año",
  "personalizado",
  "desde_el_inicio",
]);

function normalizeStoredAnalysisFilters(raw: unknown): TransactionFilters {
  const out: TransactionFilters = { ...DEFAULT_ANALYSIS_FILTERS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;

  if (typeof o.periodo === "string" && VALID_PERIODS.has(o.periodo)) {
    out.periodo = o.periodo as TransactionPeriod;
  }
  if (typeof o.fechaDesde === "string") out.fechaDesde = o.fechaDesde;
  if (typeof o.fechaHasta === "string") out.fechaHasta = o.fechaHasta;
  if (typeof o.account_id === "string") out.account_id = o.account_id;
  if (typeof o.category_id === "string") out.category_id = o.category_id;
  if (Array.isArray(o.tag_ids)) {
    out.tag_ids = o.tag_ids.filter((id): id is string => typeof id === "string");
  }
  if (typeof o.showIngresos === "boolean") out.showIngresos = o.showIngresos;
  if (typeof o.showGastos === "boolean") out.showGastos = o.showGastos;

  return out;
}

function persistAnalysisFilters(f: TransactionFilters) {
  try {
    localStorage.setItem(ANALYSIS_FILTER_KEY, JSON.stringify(f));
  } catch {}
}

function lastVariacionMes(variaciones: VariacionMesPar[] | undefined): VariacionMesPar | null {
  if (!variaciones?.length) return null;
  return variaciones[variaciones.length - 1] ?? null;
}

interface Props {
  initialTransactions: TransactionWithRelations[];
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
}

export function AnalysisClient({ initialTransactions, accounts, categories, tags }: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_ANALYSIS_FILTERS);
  const [loading, setLoading] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [catSearch, setCatSearch] = useState("");
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catInputRef = useRef<HTMLInputElement>(null);

  const [tagSearch, setTagSearch] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [insightsMarkdown, setInsightsMarkdown] = useState<string>("");
  const [insightsSource, setInsightsSource] = useState<"ai" | "stats" | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsBanner, setInsightsBanner] = useState<string | null>(null);

  const applyFilters = useCallback(async (next: TransactionFilters) => {
    setLoading(true);
    try {
      const data = await getTransactions(next);
      setTransactions(data);
      setFilters(next);
      persistAnalysisFilters(next);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al cargar datos";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ANALYSIS_FILTER_KEY);
      if (raw) {
        const parsed = normalizeStoredAnalysisFilters(JSON.parse(raw));
        void applyFilters(parsed);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCategory = categories.find((c) => c.id === filters.category_id);
  const displayCurrency = accounts.find((a) => a.id === filters.account_id)?.moneda ?? "ARS";

  const tagIdToName = useMemo(
    () => Object.fromEntries(tags.map((t) => [t.id, t.nombre])),
    [tags]
  );

  const appliedTagSummary = useMemo(() => {
    const ids = filters.tag_ids ?? [];
    if (ids.length === 0) return null;
    const names = ids.map((id) => tagIdToName[id] ?? id.slice(0, 8)).join(", ");
    return names;
  }, [filters.tag_ids, tagIdToName]);

  const monthlySeries = useMemo(() => buildMonthlyChartSeries(transactions, filters), [transactions, filters]);

  const aiPayload = useMemo(() => buildFinancialAiPayload(transactions, filters), [transactions, filters]);

  const analysisMatrix = useMemo(
    () => buildAnalysisMatrix(transactions, filters, accounts, categories, tagIdToName),
    [transactions, filters, accounts, categories, tagIdToName]
  );

  const consolidadoUltimoMes = useMemo(
    () => lastVariacionMes(analysisMatrix.consolidado_general.variaciones),
    [analysisMatrix]
  );

  const insightsBody = useMemo(
    () => ({ ...aiPayload, matriz_analisis: analysisMatrix }),
    [aiPayload, analysisMatrix]
  );

  const statisticalMd = useMemo(
    () =>
      generateStatisticalInsightsMarkdown(monthlySeries, aiPayload, {
        categoryName: selectedCategory?.nombre ?? null,
        tagIdToName,
        appliedTagSummary,
      }),
    [monthlySeries, aiPayload, selectedCategory?.nombre, tagIdToName, appliedTagSummary]
  );

  const payloadKey = useMemo(() => JSON.stringify(insightsBody), [insightsBody]);

  const requestInsights = useCallback(
    async (opts?: { silent?: boolean }) => {
      setInsightsLoading(true);
      setInsightsBanner(null);
      try {
        const res = await fetch("/api/analysis/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(insightsBody),
        });
        const json = (await res.json()) as {
          markdown: string | null;
          fallback?: boolean;
          error?: string | null;
          hint?: string | null;
          debug?: string;
        };

        if (res.status === 401) {
          setInsightsMarkdown(statisticalMd);
          setInsightsSource("stats");
          setInsightsBanner("Sesión no válida; mostramos análisis estadístico local.");
          return;
        }

        if (json.markdown?.trim()) {
          setInsightsMarkdown(json.markdown.trim());
          setInsightsSource("ai");
          return;
        }

        if (json.error === "no_key") {
          setInsightsMarkdown(statisticalMd);
          setInsightsSource("stats");
          if (!opts?.silent) {
            setInsightsBanner(
              "No hay clave de Gemini configurada; mostramos un análisis estadístico local. Opcional: definí GEMINI_API_KEY o NEXT_PUBLIC_GEMINI_API_KEY en el servidor."
            );
          }
          return;
        }

        setInsightsMarkdown(statisticalMd);
        setInsightsSource("stats");
        const hint = json.hint ?? "Estamos procesando tus datos estadísticamente…";
        const devNote = json.debug ? ` (${json.debug})` : "";
        setInsightsBanner(`${hint}${devNote}`);
        if (!opts?.silent) {
          toast({
            title: "Análisis alternativo",
            description: hint,
          });
        }
      } catch {
        setInsightsMarkdown(statisticalMd);
        setInsightsSource("stats");
        setInsightsBanner("Estamos procesando tus datos estadísticamente…");
      } finally {
        setInsightsLoading(false);
      }
    },
    [insightsBody, statisticalMd]
  );

  useEffect(() => {
    setInsightsLoading(true);
    const t = window.setTimeout(() => {
      void requestInsights({ silent: true });
    }, 1000);
    return () => window.clearTimeout(t);
  }, [payloadKey, requestInsights]);

  const clearFilters = () => {
    try {
      localStorage.removeItem(ANALYSIS_FILTER_KEY);
    } catch {}
    setCatSearch("");
    setTagSearch("");
    void applyFilters({ ...DEFAULT_ANALYSIS_FILTERS });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-xl border border-[#0e415f]/15 bg-gradient-to-br from-[#f4f0e0]/40 via-background to-background p-6 dark:from-[#0e415f]/20 dark:via-background dark:to-background">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#0e415f] text-[#f4f0e0] dark:bg-[#f4f0e0] dark:text-[#0e415f]">
              <LineChartIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#0e415f] dark:text-[#f4f0e0]">
                Análisis de Datos
              </h1>
              <p className="text-sm text-muted-foreground">
                Tendencia mensual de ingresos y gastos según filtros; insights con IA o respaldo estadístico.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-4 pb-4">
          <div className="flex items-center justify-between gap-2 md:hidden">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 touch-manipulation gap-2"
              aria-expanded={mobileFiltersOpen}
              onClick={() => setMobileFiltersOpen((o) => !o)}
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0" />
              {mobileFiltersOpen ? "Ocultar filtros" : "Filtros"}
            </Button>
          </div>

          <div className={cn("space-y-3", !mobileFiltersOpen && "max-md:hidden")}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[10rem] flex-1 basis-[min(100%,12rem)] space-y-1">
                <Label className="text-xs text-muted-foreground">Cuenta</Label>
                <Select
                  value={filters.account_id ?? "todas"}
                  onValueChange={(v) =>
                    void applyFilters({ ...filters, account_id: v === "todas" ? undefined : v })
                  }
                >
                  <SelectTrigger className="h-11 min-h-11 touch-manipulation text-xs sm:h-9 sm:min-h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[10rem] flex-1 basis-[min(100%,13rem)] space-y-1">
                <Label className="text-xs text-muted-foreground">Categoría</Label>
                <div className="relative">
                  <Input
                    ref={catInputRef}
                    className="h-11 min-h-11 touch-manipulation pr-7 text-xs sm:h-9 sm:min-h-9"
                    placeholder={selectedCategory ? selectedCategory.nombre : "Buscar categoría…"}
                    value={catSearch}
                    onChange={(e) => {
                      setCatSearch(e.target.value);
                      setCatDropdownOpen(true);
                    }}
                    onFocus={() => setCatDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setCatDropdownOpen(false), 150)}
                  />
                  {filters.category_id && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-h-8 min-w-8 touch-manipulation"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCatSearch("");
                        void applyFilters({ ...filters, category_id: undefined });
                      }}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                  {catDropdownOpen && (
                    <div
                      className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <button
                        type="button"
                        className="min-h-11 w-full touch-manipulation px-3 py-2.5 text-left text-xs text-muted-foreground hover:bg-accent sm:min-h-9 sm:py-2"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setCatSearch("");
                          setCatDropdownOpen(false);
                          void applyFilters({ ...filters, category_id: undefined });
                        }}
                      >
                        Todas las categorías
                      </button>
                      {categories
                        .filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase()))
                        .map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            className="flex min-h-11 w-full touch-manipulation items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-accent sm:min-h-9 sm:py-2"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setCatSearch("");
                              setCatDropdownOpen(false);
                              void applyFilters({ ...filters, category_id: cat.id });
                            }}
                          >
                            <DynamicCategoryIcon iconName={cat.icono} className="h-3.5 w-3.5 shrink-0" />
                            {cat.nombre}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-[10rem] flex-1 basis-[min(100%,13rem)] space-y-1">
                <Label className="text-xs text-muted-foreground">Etiquetas</Label>
                {(filters.tag_ids ?? []).length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {(filters.tag_ids ?? []).map((id) => {
                      const tag = tags.find((t) => t.id === id);
                      if (!tag) return null;
                      return (
                        <button
                          key={id}
                          type="button"
                          className="flex min-h-8 touch-manipulation items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const next = (filters.tag_ids ?? []).filter((tid) => tid !== id);
                            void applyFilters({ ...filters, tag_ids: next.length ? next : undefined });
                          }}
                        >
                          {tag.nombre}
                          <X className="h-3 w-3" />
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="relative">
                  <Input
                    ref={tagInputRef}
                    className="h-11 min-h-11 touch-manipulation text-xs sm:h-9 sm:min-h-9"
                    placeholder="Buscar etiqueta…"
                    value={tagSearch}
                    onChange={(e) => {
                      setTagSearch(e.target.value);
                      setTagDropdownOpen(true);
                    }}
                    onFocus={() => setTagDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setTagDropdownOpen(false), 150)}
                  />
                  {tagDropdownOpen && (
                    <div
                      className="absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-popover shadow-md"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {tags
                        .filter(
                          (t) =>
                            t.nombre.toLowerCase().includes(tagSearch.toLowerCase()) &&
                            !(filters.tag_ids ?? []).includes(t.id)
                        )
                        .map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            className="min-h-11 w-full touch-manipulation px-3 py-2.5 text-left text-xs hover:bg-accent sm:min-h-9 sm:py-2"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const next = [...(filters.tag_ids ?? []), tag.id];
                              void applyFilters({ ...filters, tag_ids: next });
                              setTagSearch("");
                              setTagDropdownOpen(false);
                            }}
                          >
                            {tag.nombre}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-[10rem] flex-1 basis-[min(100%,12rem)] space-y-1">
                <Label className="text-xs text-muted-foreground">Período</Label>
                <Select
                  value={filters.periodo ?? "ultimo_año"}
                  onValueChange={(v) => {
                    if (!isValidTransactionPeriod(v)) return;
                    void applyFilters({ ...filters, periodo: v });
                  }}
                >
                  <SelectTrigger className="h-11 min-h-11 touch-manipulation text-xs sm:h-9 sm:min-h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mes_actual">Mes actual</SelectItem>
                    <SelectItem value="mes_anterior">Mes anterior</SelectItem>
                    <SelectItem value="ultimos_3_meses">Últimos 3 meses</SelectItem>
                    <SelectItem value="año_actual">Año actual</SelectItem>
                    <SelectItem value="ultimo_año">Último año</SelectItem>
                    <SelectItem value="personalizado">Período personalizado</SelectItem>
                    <SelectItem value="desde_el_inicio">Desde el inicio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-h-[44px] flex-wrap items-center gap-x-4 gap-y-2 pb-0.5">
                <div className="flex min-h-11 items-center gap-2 sm:min-h-8">
                  <Checkbox
                    id="an-ingresos"
                    checked={filters.showIngresos !== false}
                    onCheckedChange={(v) => void applyFilters({ ...filters, showIngresos: v === true })}
                    className="h-5 w-5 touch-manipulation border-green-600/45 data-[state=checked]:border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:text-white"
                  />
                  <Label
                    htmlFor="an-ingresos"
                    className="min-h-11 cursor-pointer py-2 text-xs font-normal sm:min-h-0 sm:py-0"
                  >
                    Ingresos
                  </Label>
                </div>
                <div className="flex min-h-11 items-center gap-2 sm:min-h-8">
                  <Checkbox
                    id="an-gastos"
                    checked={filters.showGastos !== false}
                    onCheckedChange={(v) => void applyFilters({ ...filters, showGastos: v === true })}
                    className="h-5 w-5 touch-manipulation border-red-600/45 data-[state=checked]:border-red-600 data-[state=checked]:bg-red-600 data-[state=checked]:text-white"
                  />
                  <Label
                    htmlFor="an-gastos"
                    className="min-h-11 cursor-pointer py-2 text-xs font-normal sm:min-h-0 sm:py-0"
                  >
                    Gastos
                  </Label>
                </div>
              </div>
            </div>

            {filters.periodo === "personalizado" && (
              <div className="grid max-w-md grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Desde</Label>
                  <Input
                    type="date"
                    className="h-11 min-h-11 touch-manipulation text-xs sm:h-9 sm:min-h-9"
                    value={filters.fechaDesde ?? ""}
                    onChange={(e) => void applyFilters({ ...filters, fechaDesde: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Hasta</Label>
                  <Input
                    type="date"
                    className="h-11 min-h-11 touch-manipulation text-xs sm:h-9 sm:min-h-9"
                    value={filters.fechaHasta ?? ""}
                    onChange={(e) => void applyFilters({ ...filters, fechaHasta: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 touch-manipulation text-xs sm:h-8"
                onClick={clearFilters}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Restablecer filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="scroll-mt-4">
        <CardHeader>
          <CardTitle className="text-base">Tendencia comparativa</CardTitle>
          <CardDescription>Ingresos (verde) y gastos (rojo) por mes según filtros actuales.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[320px]">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : monthlySeries.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No hay datos en el rango seleccionado.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={monthlySeries} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v ?? 0), displayCurrency)}
                  contentStyle={{ fontSize: 12, maxWidth: "min(100vw - 2rem, 20rem)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="ingresos"
                  name="Ingresos"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="gastos"
                  name="Gastos"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Matriz de análisis (mes vs mes anterior)</CardTitle>
          <CardDescription>
            Comparativas porcentuales en el rango filtrado. Las tablas muestran el{" "}
            <strong>último par de meses</strong> del período ({analysisMatrix.resumen_total_seleccion.mes_anterior_label ?? "—"} →{" "}
            {analysisMatrix.resumen_total_seleccion.mes_actual_label ?? "—"}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {filters.showIngresos !== false && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground">Ingresos (paquete filtrado)</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrency(analysisMatrix.resumen_total_seleccion.ingresos_actual, displayCurrency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  vs anterior: {formatCurrency(analysisMatrix.resumen_total_seleccion.ingresos_anterior, displayCurrency)}
                </p>
                <Badge variant="secondary" className="mt-2 font-mono text-xs">
                  Δ {analysisMatrix.resumen_total_seleccion.ingresos_delta_etiqueta}
                </Badge>
              </div>
            )}
            {filters.showGastos !== false && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground">Gastos (paquete filtrado)</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrency(analysisMatrix.resumen_total_seleccion.gastos_actual, displayCurrency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  vs anterior: {formatCurrency(analysisMatrix.resumen_total_seleccion.gastos_anterior, displayCurrency)}
                </p>
                <Badge variant="secondary" className="mt-2 font-mono text-xs">
                  Δ {analysisMatrix.resumen_total_seleccion.gastos_delta_etiqueta}
                </Badge>
              </div>
            )}
            <div className="rounded-lg border border-[#0e415f]/20 bg-[#f4f0e0]/30 p-4 dark:border-[#f4f0e0]/20 dark:bg-[#0e415f]/20 sm:col-span-2 lg:col-span-2">
              <p className="text-xs font-medium text-[#0e415f] dark:text-[#f4f0e0]">Resumen del paquete seleccionado</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Totales del último mes del período frente al mes previo (todas las categorías y etiquetas incluidas en los
                filtros actuales).
              </p>
            </div>
          </div>

          {consolidadoUltimoMes && consolidadoUltimoMes.filas.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{analysisMatrix.consolidado_general.nombre}</h3>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 font-medium">Ruta</th>
                      <th className="px-3 py-2 font-medium">Anterior</th>
                      <th className="px-3 py-2 font-medium">Actual</th>
                      <th className="px-3 py-2 font-medium">Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidadoUltimoMes.filas.slice(0, 14).map((row, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground" title={row.ruta}>
                          {row.ruta}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{formatCurrency(row.monto_anterior, displayCurrency)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatCurrency(row.monto_actual, displayCurrency)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "font-mono font-medium",
                              row.delta_etiqueta === "Nuevo" && "text-blue-600 dark:text-blue-400",
                              row.delta_etiqueta === "—" && "text-muted-foreground",
                              (row.delta_pct ?? 0) > 0 && row.tipo === "gasto" && "text-red-600 dark:text-red-400",
                              (row.delta_pct ?? 0) < 0 && row.tipo === "gasto" && "text-green-600 dark:text-green-400",
                              (row.delta_pct ?? 0) > 0 && row.tipo === "ingreso" && "text-green-600 dark:text-green-400",
                              (row.delta_pct ?? 0) < 0 && row.tipo === "ingreso" && "text-red-600 dark:text-red-400"
                            )}
                          >
                            {row.delta_etiqueta}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay suficientes meses con movimientos para armar la matriz (se requieren al menos dos meses en el período).
            </p>
          )}

          {analysisMatrix.por_cuenta.some((c) => (lastVariacionMes(c.variaciones)?.filas.length ?? 0) > 0) && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Por cuenta</h3>
              <div className="grid gap-4 lg:grid-cols-2">
                {analysisMatrix.por_cuenta.map((cuenta) => {
                  const v = lastVariacionMes(cuenta.variaciones);
                  if (!v?.filas.length) return null;
                  return (
                    <div key={cuenta.cuenta_id} className="space-y-2 rounded-lg border p-3">
                      <p className="text-sm font-medium">{cuenta.nombre}</p>
                      <div className="overflow-x-auto rounded-md border">
                        <table className="w-full min-w-[520px] text-left text-[11px]">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-2 py-1.5">Ruta</th>
                              <th className="px-2 py-1.5">Ant.</th>
                              <th className="px-2 py-1.5">Act.</th>
                              <th className="px-2 py-1.5">Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {v.filas.slice(0, 8).map((row, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="max-w-[220px] truncate px-2 py-1.5 text-muted-foreground" title={row.ruta}>
                                  {row.ruta}
                                </td>
                                <td className="px-2 py-1.5 tabular-nums">{formatCurrency(row.monto_anterior, displayCurrency)}</td>
                                <td className="px-2 py-1.5 tabular-nums">{formatCurrency(row.monto_actual, displayCurrency)}</td>
                                <td className="px-2 py-1.5 font-mono">{row.delta_etiqueta}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#0e415f]/20 dark:border-[#f4f0e0]/20">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#0e415f] dark:text-[#f4f0e0]" />
            <div>
              <CardTitle className="text-base">Insights de IA</CardTitle>
              <CardDescription>Resultados del análisis inteligente (Gemini 1.5 Flash o respaldo estadístico).</CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0 touch-manipulation gap-2 sm:min-h-9"
            disabled={insightsLoading}
            onClick={() => void requestInsights()}
          >
            {insightsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Regenerar análisis
          </Button>
        </CardHeader>
        <CardContent>
          {insightsBanner && (
            <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              {insightsBanner}
            </p>
          )}
          {insightsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-[70%]" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <div
              className={cn(
                "space-y-2 text-sm leading-relaxed",
                "[&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1.5 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-base"
              )}
            >
              <ReactMarkdown>{insightsMarkdown}</ReactMarkdown>
            </div>
          )}
          {insightsSource && (
            <p className="mt-3 text-xs text-muted-foreground">
              Fuente: {insightsSource === "ai" ? "Modelo Gemini" : "Análisis estadístico local"}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
