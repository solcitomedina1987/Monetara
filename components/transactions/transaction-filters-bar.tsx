"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ElementType, ReactNode, RefObject } from "react";
import * as LucideIcons from "lucide-react";
import { Check, FolderOpen, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { resolvedAccountIds, resolvedCategoryIds } from "@/lib/transaction-filters";
import type { Account, Category, Tag, TransactionFilters, TransactionPeriod } from "@/lib/types";

const FILTER_DROPDOWN_Z = 10_000;

const PERIOD_LABELS: Record<TransactionPeriod, string> = {
  hoy: "Hoy",
  ultimos_7_dias: "Últimos 7 días",
  mes_actual: "Este mes",
  mes_anterior: "Último mes",
  ultimos_3_meses: "Últimos 3 meses",
  año_actual: "Año actual",
  ultimo_año: "Último año",
  personalizado: "Personalizado",
  desde_el_inicio: "Desde el inicio",
};

function DynamicCategoryIcon({
  iconName,
  className,
}: {
  iconName: string | null | undefined;
  className?: string;
}) {
  const cls = className ?? "h-3 w-3";
  if (!iconName) return <FolderOpen className={cls} />;
  const IconComponent = (LucideIcons as any)[iconName] as ElementType<{ className?: string }>;
  if (!IconComponent) return <FolderOpen className={cls} />;
  return <IconComponent className={cls} />;
}

function FilterRemovableBadge({
  label,
  onRemove,
  icon,
  variant = "default",
}: {
  label: string;
  onRemove: () => void;
  icon?: ReactNode;
  variant?: "default" | "primary" | "period";
}) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => {
        e.preventDefault();
        onRemove();
      }}
      className={cn(
        "inline-flex max-w-[9rem] shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors",
        variant === "primary" && "bg-primary text-primary-foreground",
        variant === "period" && "bg-[#0e415f]/10 text-[#0e415f] dark:bg-[#f4f0e0]/15 dark:text-[#f4f0e0]",
        variant === "default" && "bg-muted text-foreground"
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      <X className="h-2.5 w-2.5 shrink-0 opacity-80" />
    </button>
  );
}

export interface TransactionFiltersBarProps {
  filters: TransactionFilters;
  onFiltersChange: (next: TransactionFilters) => void;
  onClear: () => void;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  idPrefix: string;
  filtersRowClassName?: string;
  cardClassName?: string;
  /** Acciones opcionales debajo de los filtros (p. ej. export en Reportes) */
  footer?: ReactNode;
}

type MenuPos = { top: number; left: number; width: number };

function clampMenuLeft(left: number, width: number) {
  const pad = 8;
  return Math.max(pad, Math.min(left, window.innerWidth - width - pad));
}

function useFixedMenuPosition(anchorRef: RefObject<HTMLDivElement | null>, open: boolean) {
  const [pos, setPos] = useState<MenuPos | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const el = anchorRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const width = Math.min(Math.max(r.width, 160), window.innerWidth - 16);
      setPos({ top: r.bottom + 4, left: clampMenuLeft(r.left, width), width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  return pos;
}

function periodBadgeLabel(filters: TransactionFilters): string | null {
  const p = filters.periodo ?? "mes_actual";
  if (p === "mes_actual") return null;
  if (p === "personalizado" && filters.fechaDesde && filters.fechaHasta) {
    return `${PERIOD_LABELS.personalizado} (${filters.fechaDesde} – ${filters.fechaHasta})`;
  }
  return PERIOD_LABELS[p] ?? p;
}

const filterCol =
  "flex min-w-[6.5rem] max-w-[10.5rem] flex-1 flex-col gap-0.5 basis-[min(100%,9rem)]";
const filterLabel = "hidden md:block text-[10px] leading-none text-muted-foreground";
const badgeRow = "flex min-h-[1.25rem] flex-wrap gap-0.5";
const inputCls =
  "h-8 min-h-8 w-full touch-manipulation px-2 text-xs placeholder:text-muted-foreground/70";

export function TransactionFiltersBar({
  filters,
  onFiltersChange,
  onClear,
  accounts,
  categories,
  tags,
  idPrefix,
  filtersRowClassName,
  cardClassName,
  footer,
}: TransactionFiltersBarProps) {
  const [bodyReady, setBodyReady] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [accountSearch, setAccountSearch] = useState("");
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const accountAnchorRef = useRef<HTMLDivElement>(null);
  const accountMenuPos = useFixedMenuPosition(accountAnchorRef, accountDropdownOpen);

  const [catSearch, setCatSearch] = useState("");
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catAnchorRef = useRef<HTMLDivElement>(null);
  const catMenuPos = useFixedMenuPosition(catAnchorRef, catDropdownOpen);

  const [tagSearch, setTagSearch] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagAnchorRef = useRef<HTMLDivElement>(null);
  const tagMenuPos = useFixedMenuPosition(tagAnchorRef, tagDropdownOpen);

  const accountIds = resolvedAccountIds(filters);
  const catIds = resolvedCategoryIds(filters);
  const tagIds = filters.tag_ids ?? [];
  const periodLabel = periodBadgeLabel(filters);

  const idIngresos = `${idPrefix}-ingresos`;
  const idGastos = `${idPrefix}-gastos`;

  useEffect(() => setBodyReady(true), []);
  useEffect(() => {
    if (catIds.length === 0) setCatSearch("");
  }, [catIds.length]);
  useEffect(() => {
    if (accountIds.length === 0) setAccountSearch("");
  }, [accountIds.length]);

  const closeAllDropdowns = () => {
    setAccountDropdownOpen(false);
    setCatDropdownOpen(false);
    setTagDropdownOpen(false);
  };

  const setAccountIds = (next: string[]) => {
    onFiltersChange({
      ...filters,
      account_id: undefined,
      account_ids: next.length ? next : undefined,
    });
  };

  const toggleAccount = (id: string) => {
    const set = new Set(accountIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setAccountIds(Array.from(set));
  };

  const setCategoryIds = (next: string[]) => {
    onFiltersChange({
      ...filters,
      category_id: undefined,
      category_ids: next.length ? next : undefined,
    });
  };

  const toggleCategory = (id: string) => {
    const set = new Set(catIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setCategoryIds(Array.from(set));
  };

  const handleClear = () => {
    setAccountSearch("");
    setCatSearch("");
    setTagSearch("");
    onClear();
  };

  const renderDropdownPortal = (
    open: boolean,
    pos: MenuPos | null,
    children: ReactNode
  ) =>
    open &&
    bodyReady &&
    pos &&
    createPortal(
      <div
        className="max-h-[min(11rem,45vh)] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: pos.width,
          zIndex: FILTER_DROPDOWN_Z,
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {children}
      </div>,
      document.body
    );

  return (
    <Card className={cn("scroll-mt-4 overflow-visible", cardClassName)}>
      <CardContent className="space-y-2 overflow-visible px-3 py-3 md:px-4">
        <div className="flex items-center gap-2 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9 flex-1 touch-manipulation gap-2"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen((o) => !o)}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" />
            {mobileFiltersOpen ? "Ocultar filtros" : "Filtrar"}
          </Button>
        </div>

        <div className={cn(!mobileFiltersOpen ? "hidden md:block" : "block")}>
          <div
            className={cn(
              "flex flex-wrap items-end gap-x-2 gap-y-1.5 overflow-visible",
              filtersRowClassName
            )}
          >
            {/* Cuentas (multi) */}
            <div className={filterCol}>
              <Label className={filterLabel}>Cuentas</Label>
              <div className={badgeRow}>
                {accountIds.map((id) => {
                  const acc = accounts.find((a) => a.id === id);
                  if (!acc) return null;
                  return (
                    <FilterRemovableBadge
                      key={id}
                      label={acc.nombre}
                      variant="default"
                      onRemove={() => toggleAccount(id)}
                    />
                  );
                })}
              </div>
              <div ref={accountAnchorRef} className="relative">
                <Input
                  className={inputCls}
                  placeholder="Cuentas…"
                  value={accountSearch}
                  onChange={(e) => {
                    setAccountSearch(e.target.value);
                    closeAllDropdowns();
                    setAccountDropdownOpen(true);
                  }}
                  onFocus={() => {
                    closeAllDropdowns();
                    setAccountDropdownOpen(true);
                  }}
                  onBlur={() => setTimeout(() => setAccountDropdownOpen(false), 180)}
                />
              </div>
              {renderDropdownPortal(
                accountDropdownOpen,
                accountMenuPos,
                <>
                  {accounts
                    .filter((a) => a.nombre.toLowerCase().includes(accountSearch.toLowerCase()))
                    .map((acc) => {
                      const selected = accountIds.includes(acc.id);
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          className="flex min-h-9 w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-accent"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            toggleAccount(acc.id);
                          }}
                        >
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-border">
                            {selected ? <Check className="h-2.5 w-2.5" /> : null}
                          </span>
                          {acc.nombre}
                        </button>
                      );
                    })}
                </>
              )}
            </div>

            {/* Categorías (multi) */}
            <div className={cn(filterCol, "max-w-[12rem]")}>
              <Label className={filterLabel}>Categorías</Label>
              <div className={badgeRow}>
                {catIds.map((id) => {
                  const c = categories.find((x) => x.id === id);
                  if (!c) return null;
                  return (
                    <FilterRemovableBadge
                      key={id}
                      label={c.nombre}
                      variant="default"
                      icon={<DynamicCategoryIcon iconName={c.icono} className="h-2.5 w-2.5 shrink-0" />}
                      onRemove={() => toggleCategory(id)}
                    />
                  );
                })}
              </div>
              <div ref={catAnchorRef} className="relative">
                <Input
                  className={inputCls}
                  placeholder="Categorías…"
                  value={catSearch}
                  onChange={(e) => {
                    setCatSearch(e.target.value);
                    closeAllDropdowns();
                    setCatDropdownOpen(true);
                  }}
                  onFocus={() => {
                    closeAllDropdowns();
                    setCatDropdownOpen(true);
                  }}
                  onBlur={() => setTimeout(() => setCatDropdownOpen(false), 180)}
                />
              </div>
              {renderDropdownPortal(
                catDropdownOpen,
                catMenuPos,
                categories
                  .filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase()))
                  .map((cat) => {
                    const selected = catIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className="flex min-h-9 w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-accent"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          toggleCategory(cat.id);
                        }}
                      >
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-border">
                          {selected ? <Check className="h-2.5 w-2.5" /> : null}
                        </span>
                        <DynamicCategoryIcon iconName={cat.icono} className="h-3 w-3 shrink-0" />
                        {cat.nombre}
                      </button>
                    );
                  })
              )}
            </div>

            {/* Etiquetas (multi) */}
            <div className={filterCol}>
              <Label className={filterLabel}>Etiquetas</Label>
              <div className={badgeRow}>
                {tagIds.map((id) => {
                  const tag = tags.find((t) => t.id === id);
                  if (!tag) return null;
                  return (
                    <FilterRemovableBadge
                      key={id}
                      label={tag.nombre}
                      variant="primary"
                      onRemove={() => {
                        const next = tagIds.filter((tid) => tid !== id);
                        onFiltersChange({ ...filters, tag_ids: next.length ? next : undefined });
                      }}
                    />
                  );
                })}
              </div>
              <div ref={tagAnchorRef} className="relative">
                <Input
                  className={inputCls}
                  placeholder="Etiquetas…"
                  value={tagSearch}
                  onChange={(e) => {
                    setTagSearch(e.target.value);
                    closeAllDropdowns();
                    setTagDropdownOpen(true);
                  }}
                  onFocus={() => {
                    closeAllDropdowns();
                    setTagDropdownOpen(true);
                  }}
                  onBlur={() => setTimeout(() => setTagDropdownOpen(false), 180)}
                />
              </div>
              {renderDropdownPortal(
                tagDropdownOpen,
                tagMenuPos,
                tags
                  .filter(
                    (t) =>
                      t.nombre.toLowerCase().includes(tagSearch.toLowerCase()) &&
                      !tagIds.includes(t.id)
                  )
                  .map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className="min-h-9 w-full px-2.5 py-2 text-left text-xs hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onFiltersChange({
                          ...filters,
                          tag_ids: [...tagIds, tag.id],
                        });
                        setTagSearch("");
                        setTagDropdownOpen(false);
                      }}
                    >
                      {tag.nombre}
                    </button>
                  ))
              )}
            </div>

            {/* Período */}
            <div className={filterCol}>
              <Label className={filterLabel}>Período</Label>
              <div className={badgeRow}>
                {periodLabel && (
                  <FilterRemovableBadge
                    label={periodLabel}
                    variant="period"
                    onRemove={() =>
                      onFiltersChange({
                        ...filters,
                        periodo: "mes_actual",
                        fechaDesde: undefined,
                        fechaHasta: undefined,
                      })
                    }
                  />
                )}
              </div>
              <Select
                value={filters.periodo ?? "mes_actual"}
                onValueChange={(v) =>
                  onFiltersChange({
                    ...filters,
                    periodo: v as TransactionPeriod,
                    ...(v !== "personalizado"
                      ? { fechaDesde: undefined, fechaHasta: undefined }
                      : {}),
                  })
                }
              >
                <SelectTrigger className={cn(inputCls, "justify-between")}>
                  <span className="text-muted-foreground">{periodLabel ? "Cambiar…" : "Período…"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoy">Hoy</SelectItem>
                  <SelectItem value="ultimos_7_dias">Últimos 7 días</SelectItem>
                  <SelectItem value="mes_actual">Este mes</SelectItem>
                  <SelectItem value="mes_anterior">Último mes</SelectItem>
                  <SelectItem value="ultimos_3_meses">Últimos 3 meses</SelectItem>
                  <SelectItem value="año_actual">Año actual</SelectItem>
                  <SelectItem value="ultimo_año">Último año</SelectItem>
                  <SelectItem value="personalizado">Período personalizado</SelectItem>
                  <SelectItem value="desde_el_inicio">Desde el inicio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ingresos / Gastos — misma fila en desktop */}
            <div className="flex shrink-0 items-center gap-3 self-end pb-0.5 md:gap-4">
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={idIngresos}
                  checked={filters.showIngresos !== false}
                  onCheckedChange={(v) => onFiltersChange({ ...filters, showIngresos: v === true })}
                  className="h-4 w-4 border-green-600/45 data-[state=checked]:border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:text-white"
                />
                <Label htmlFor={idIngresos} className="cursor-pointer text-[11px] font-normal leading-none">
                  Ingresos
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={idGastos}
                  checked={filters.showGastos !== false}
                  onCheckedChange={(v) => onFiltersChange({ ...filters, showGastos: v === true })}
                  className="h-4 w-4 border-red-600/45 data-[state=checked]:border-red-600 data-[state=checked]:bg-red-600 data-[state=checked]:text-white"
                />
                <Label htmlFor={idGastos} className="cursor-pointer text-[11px] font-normal leading-none">
                  Gastos
                </Label>
              </div>
            </div>
          </div>

          {filters.periodo === "personalizado" && (
            <div className="mt-1.5 grid max-w-sm grid-cols-2 gap-2">
              <Input
                type="date"
                className={inputCls}
                aria-label="Desde"
                value={filters.fechaDesde ?? ""}
                onChange={(e) => onFiltersChange({ ...filters, fechaDesde: e.target.value })}
              />
              <Input
                type="date"
                className={inputCls}
                aria-label="Hasta"
                value={filters.fechaHasta ?? ""}
                onChange={(e) => onFiltersChange({ ...filters, fechaHasta: e.target.value })}
              />
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 touch-manipulation px-2 text-[11px]"
            onClick={handleClear}
          >
            <X className="mr-1 h-3 w-3" />
            Limpiar filtros
          </Button>
        </div>

        {footer ? (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">{footer}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
