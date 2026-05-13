"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode, ElementType } from "react";
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
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { resolvedCategoryIds } from "@/lib/transaction-filters";
import type { Account, Category, Tag, TransactionFilters, TransactionPeriod } from "@/lib/types";

function DynamicCategoryIcon({
  iconName,
  className,
}: {
  iconName: string | null | undefined;
  className?: string;
}) {
  const cls = className ?? "h-3.5 w-3.5";
  if (!iconName) return <FolderOpen className={cls} />;
  const IconComponent = (LucideIcons as any)[iconName] as ElementType<{ className?: string }>;
  if (!IconComponent) return <FolderOpen className={cls} />;
  return <IconComponent className={cls} />;
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
  footer?: ReactNode;
  cardClassName?: string;
}

const MAX_VISIBLE_CAT_CHIPS = 2;

export function TransactionFiltersBar({
  filters,
  onFiltersChange,
  onClear,
  accounts,
  categories,
  tags,
  idPrefix,
  filtersRowClassName,
  footer,
  cardClassName,
}: TransactionFiltersBarProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [catSearch, setCatSearch] = useState("");
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catInputRef = useRef<HTMLInputElement>(null);

  const catIds = resolvedCategoryIds(filters);
  const tagIds = filters.tag_ids ?? [];

  useEffect(() => {
    if (catIds.length === 0) setCatSearch("");
  }, [catIds.length]);

  const idIngresos = `${idPrefix}-ingresos`;
  const idGastos = `${idPrefix}-gastos`;

  const handleClear = () => {
    setCatSearch("");
    setTagSearch("");
    onClear();
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

  const clearCategories = () => setCategoryIds([]);

  return (
    <Card className={cn("scroll-mt-4 overflow-visible", cardClassName)}>
      <CardContent className="space-y-3 overflow-visible pt-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:hidden">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 touch-manipulation gap-2 sm:min-h-9"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen((o) => !o)}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" />
            {mobileFiltersOpen ? "Ocultar filtros" : "Filtrar"}
          </Button>
        </div>

        <div
          className={cn(
            "space-y-3",
            !mobileFiltersOpen ? "hidden md:block" : "block"
          )}
        >
          <div
            className={cn(
              "flex flex-wrap items-stretch gap-3 overflow-x-visible overflow-y-visible",
              filtersRowClassName
            )}
          >
            {/* Cuenta */}
            <div className="flex min-h-[7rem] min-w-[12rem] flex-1 flex-col justify-end gap-1 basis-[min(100%,14rem)]">
              <Label className="text-xs text-muted-foreground">Cuenta</Label>
              <div className="h-6 min-h-6 shrink-0" aria-hidden />
              <Select
                value={filters.account_id ?? "todas"}
                onValueChange={(v) =>
                  onFiltersChange({ ...filters, account_id: v === "todas" ? undefined : v })
                }
              >
                <SelectTrigger className="h-11 min-h-11 w-full min-w-[12rem] max-w-full touch-manipulation text-xs sm:h-8 sm:min-h-8 [&>span]:line-clamp-2 [&>span]:text-left [&>span]:leading-snug">
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

            {/* Categorías (multi) */}
            <div className="flex min-h-[7rem] min-w-[12rem] flex-1 flex-col justify-end gap-1 basis-[min(100%,22rem)]">
              <Label className="text-xs text-muted-foreground">Categorías</Label>
              <div className="flex h-6 min-h-6 shrink-0 items-center gap-1 overflow-hidden">
                {catIds.length > 0 ? (
                  <>
                    {catIds.slice(0, MAX_VISIBLE_CAT_CHIPS).map((id) => {
                      const c = categories.find((x) => x.id === id);
                      if (!c) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex max-w-[40%] shrink items-center gap-0.5 truncate rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
                          title={c.nombre}
                        >
                          <DynamicCategoryIcon iconName={c.icono} className="h-3 w-3 shrink-0" />
                          <span className="truncate">{c.nombre}</span>
                        </span>
                      );
                    })}
                    {catIds.length > MAX_VISIBLE_CAT_CHIPS && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        +{catIds.length - MAX_VISIBLE_CAT_CHIPS}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[11px] text-transparent select-none">.</span>
                )}
              </div>
              <div className="relative z-0">
                <Input
                  ref={catInputRef}
                  className="h-11 min-h-11 w-full min-w-[12rem] touch-manipulation pr-7 text-xs sm:h-8 sm:min-h-8"
                  placeholder={
                    catIds.length ? `${catIds.length} categoría${catIds.length > 1 ? "s" : ""}` : "Buscar categoría…"
                  }
                  value={catSearch}
                  onChange={(e) => {
                    setCatSearch(e.target.value);
                    setTagDropdownOpen(false);
                    setCatDropdownOpen(true);
                  }}
                  onFocus={() => {
                    setTagDropdownOpen(false);
                    setCatDropdownOpen(true);
                  }}
                  onBlur={() => setTimeout(() => setCatDropdownOpen(false), 180)}
                />
                {catIds.length > 0 && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCatSearch("");
                      clearCategories();
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
                {catDropdownOpen && (
                  <div
                    className="absolute left-0 right-0 z-[500] mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg md:left-0 md:right-auto md:min-w-full md:max-w-[min(100vw-2rem,24rem)]"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <button
                      type="button"
                      className="min-h-11 w-full touch-manipulation px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent sm:min-h-9 sm:py-2"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCatSearch("");
                        setCatDropdownOpen(false);
                        clearCategories();
                      }}
                    >
                      Todas las categorías
                    </button>
                    {categories
                      .filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase()))
                      .map((cat) => {
                        const selected = catIds.includes(cat.id);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            className="flex min-h-11 w-full touch-manipulation items-center gap-2 whitespace-normal break-words px-3 py-2.5 text-left text-xs transition-colors hover:bg-accent sm:min-h-9 sm:py-2"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              toggleCategory(cat.id);
                            }}
                          >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center border border-border rounded-sm">
                              {selected ? <Check className="h-3 w-3" /> : null}
                            </span>
                            <DynamicCategoryIcon iconName={cat.icono} className="h-3 w-3 shrink-0" />
                            {cat.nombre}
                          </button>
                        );
                      })}
                    {categories.filter((c) =>
                      c.nombre.toLowerCase().includes(catSearch.toLowerCase())
                    ).length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Etiquetas */}
            <div className="flex min-h-[7rem] min-w-[10rem] flex-1 flex-col justify-end gap-1 basis-[min(100%,14rem)]">
              <Label className="text-xs text-muted-foreground">Etiquetas</Label>
              <div className="flex h-6 min-h-6 max-h-6 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden">
                {tagIds.length > 0 ? (
                  tagIds.map((id) => {
                    const tag = tags.find((t) => t.id === id);
                    if (!tag) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const newIds = tagIds.filter((tid) => tid !== id);
                          onFiltersChange({ ...filters, tag_ids: newIds.length ? newIds : undefined });
                        }}
                        className="inline-flex max-w-[7rem] shrink-0 items-center gap-0.5 truncate rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground"
                        title={tag.nombre}
                      >
                        <span className="truncate">{tag.nombre}</span>
                        <X className="h-2 w-2 shrink-0 opacity-90" />
                      </button>
                    );
                  })
                ) : (
                  <span className="text-[11px] text-transparent select-none">.</span>
                )}
              </div>
              <div className="relative z-0">
                <Input
                  ref={tagInputRef}
                  className="h-11 min-h-11 touch-manipulation pr-7 text-xs sm:h-8 sm:min-h-8"
                  placeholder="Buscar etiqueta…"
                  value={tagSearch}
                  onChange={(e) => {
                    setTagSearch(e.target.value);
                    setCatDropdownOpen(false);
                    setTagDropdownOpen(true);
                  }}
                  onFocus={() => {
                    setCatDropdownOpen(false);
                    setTagDropdownOpen(true);
                  }}
                  onBlur={() => setTimeout(() => setTagDropdownOpen(false), 180)}
                />
                {tagIds.length > 0 && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setTagSearch("");
                      onFiltersChange({ ...filters, tag_ids: undefined });
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
                {tagDropdownOpen && (
                  <div
                    className="absolute left-0 right-0 z-[400] mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover shadow-lg md:left-0 md:right-auto md:min-w-full md:max-w-[min(100vw-2rem,24rem)]"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {tags
                      .filter(
                        (t) =>
                          t.nombre.toLowerCase().includes(tagSearch.toLowerCase()) &&
                          !tagIds.includes(t.id)
                      )
                      .map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          className="min-h-11 w-full touch-manipulation px-3 py-2.5 text-left text-xs transition-colors hover:bg-accent sm:min-h-9 sm:py-2"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const newIds = [...tagIds, tag.id];
                            onFiltersChange({ ...filters, tag_ids: newIds });
                            setTagSearch("");
                            setTagDropdownOpen(false);
                          }}
                        >
                          {tag.nombre}
                        </button>
                      ))}
                    {tags.filter(
                      (t) =>
                        t.nombre.toLowerCase().includes(tagSearch.toLowerCase()) && !tagIds.includes(t.id)
                    ).length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Período */}
            <div className="flex min-h-[7rem] min-w-[12rem] flex-1 flex-col justify-end gap-1 basis-[min(100%,14rem)]">
              <Label className="text-xs text-muted-foreground">Período</Label>
              <div className="h-6 min-h-6 shrink-0" aria-hidden />
              <Select
                value={filters.periodo ?? "mes_actual"}
                onValueChange={(v) =>
                  onFiltersChange({ ...filters, periodo: v as TransactionPeriod })
                }
              >
                <SelectTrigger className="h-11 min-h-11 w-full min-w-[12rem] max-w-full touch-manipulation text-xs sm:h-8 sm:min-h-8 [&>span]:line-clamp-2 [&>span]:text-left [&>span]:leading-snug">
                  <SelectValue />
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

            {/* Ingresos / Gastos */}
            <div className="flex min-h-[7rem] min-w-[9rem] shrink-0 flex-col justify-end gap-1">
              <Label className="text-xs text-muted-foreground opacity-0">Tipo</Label>
              <div className="h-6 min-h-6 shrink-0" aria-hidden />
              <div className="flex min-h-11 flex-col justify-center gap-2 pb-0.5 sm:min-h-8">
                <div className="flex min-h-11 items-center gap-2 sm:min-h-8">
                  <Checkbox
                    id={idIngresos}
                    checked={filters.showIngresos !== false}
                    onCheckedChange={(v) => onFiltersChange({ ...filters, showIngresos: v === true })}
                    className="h-5 w-5 touch-manipulation border-green-600/45 data-[state=checked]:border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:text-white dark:border-green-500/55"
                  />
                  <Label
                    htmlFor={idIngresos}
                    className="cursor-pointer whitespace-nowrap text-xs font-normal leading-none"
                  >
                    Ingresos
                  </Label>
                </div>
                <div className="flex min-h-11 items-center gap-2 sm:min-h-8">
                  <Checkbox
                    id={idGastos}
                    checked={filters.showGastos !== false}
                    onCheckedChange={(v) => onFiltersChange({ ...filters, showGastos: v === true })}
                    className="h-5 w-5 touch-manipulation border-red-600/45 data-[state=checked]:border-red-600 data-[state=checked]:bg-red-600 data-[state=checked]:text-white dark:border-red-500/55"
                  />
                  <Label
                    htmlFor={idGastos}
                    className="cursor-pointer whitespace-nowrap text-xs font-normal leading-none"
                  >
                    Gastos
                  </Label>
                </div>
              </div>
            </div>
          </div>

          {filters.periodo === "personalizado" && (
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Desde</Label>
                <Input
                  type="date"
                  className="h-11 min-h-11 touch-manipulation text-xs sm:h-8 sm:min-h-8"
                  value={filters.fechaDesde ?? ""}
                  onChange={(e) => onFiltersChange({ ...filters, fechaDesde: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hasta</Label>
                <Input
                  type="date"
                  className="h-11 min-h-11 touch-manipulation text-xs sm:h-8 sm:min-h-8"
                  value={filters.fechaHasta ?? ""}
                  onChange={(e) => onFiltersChange({ ...filters, fechaHasta: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 touch-manipulation text-xs sm:h-8"
              onClick={handleClear}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Limpiar filtros
            </Button>
          </div>
        </div>

        {footer ? <div className="flex flex-wrap gap-2 border-t border-border pt-3">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
