"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode, ElementType } from "react";
import * as LucideIcons from "lucide-react";
import { FolderOpen, SlidersHorizontal, X } from "lucide-react";
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
  /** For `htmlFor` / `id` on ingresos/gastos checkboxes (unique per screen). */
  idPrefix: string;
  /** Extra classes on the flex row that wraps cuenta → toggles (e.g. Reportes desktop nowrap). */
  filtersRowClassName?: string;
  /** Optional block below the collapsible filter panel (e.g. Importar / Exportar en Movimientos). */
  footer?: ReactNode;
  cardClassName?: string;
}

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

  useEffect(() => {
    if (!filters.category_id) setCatSearch("");
  }, [filters.category_id]);

  const selectedCategory = categories.find((c) => c.id === filters.category_id);
  const idIngresos = `${idPrefix}-ingresos`;
  const idGastos = `${idPrefix}-gastos`;

  const handleClear = () => {
    setCatSearch("");
    setTagSearch("");
    onClear();
  };

  return (
    <Card className={cn("scroll-mt-4", cardClassName)}>
      <CardContent className="space-y-3 pt-4 pb-4">
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

        <div className={cn("space-y-3", !mobileFiltersOpen && "max-md:hidden")}>
          <div
            className={cn("flex flex-wrap items-end gap-3", filtersRowClassName)}
          >
            <div className="min-w-[10rem] flex-1 basis-[min(100%,12rem)] space-y-1">
              <Label className="text-xs text-muted-foreground">Cuenta</Label>
              <Select
                value={filters.account_id ?? "todas"}
                onValueChange={(v) =>
                  onFiltersChange({ ...filters, account_id: v === "todas" ? undefined : v })
                }
              >
                <SelectTrigger className="h-11 min-h-11 w-full min-w-0 touch-manipulation text-xs sm:h-8 sm:min-h-8">
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
              <Label className="text-xs text-muted-foreground">Categorías</Label>
              <div className="relative">
                <Input
                  ref={catInputRef}
                  className="h-11 min-h-11 touch-manipulation pr-7 text-xs sm:h-8 sm:min-h-8"
                  placeholder={selectedCategory ? selectedCategory.nombre : "Buscar categoría..."}
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
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCatSearch("");
                      onFiltersChange({ ...filters, category_id: undefined });
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
                {catDropdownOpen && (
                  <div
                    className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <button
                      type="button"
                      className="min-h-11 w-full touch-manipulation px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent sm:min-h-9 sm:py-2"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCatSearch("");
                        setCatDropdownOpen(false);
                        onFiltersChange({ ...filters, category_id: undefined });
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
                          className="flex min-h-11 w-full touch-manipulation items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-accent sm:min-h-9 sm:py-2"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setCatSearch("");
                            setCatDropdownOpen(false);
                            onFiltersChange({ ...filters, category_id: cat.id });
                          }}
                        >
                          <DynamicCategoryIcon iconName={cat.icono} className="h-3 w-3 shrink-0" />
                          {cat.nombre}
                        </button>
                      ))}
                    {categories.filter((c) =>
                      c.nombre.toLowerCase().includes(catSearch.toLowerCase())
                    ).length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
              {selectedCategory && !catSearch && (
                <p className="truncate text-xs text-primary">{selectedCategory.nombre}</p>
              )}
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
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const newIds = (filters.tag_ids ?? []).filter((tid) => tid !== id);
                          onFiltersChange({ ...filters, tag_ids: newIds.length ? newIds : undefined });
                        }}
                        className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                      >
                        {tag.nombre}
                        <X className="h-2.5 w-2.5" />
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="relative">
                <Input
                  ref={tagInputRef}
                  className="h-11 min-h-11 touch-manipulation text-xs sm:h-8 sm:min-h-8"
                  placeholder="Buscar etiqueta..."
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
                          className="min-h-11 w-full touch-manipulation px-3 py-2.5 text-left text-xs transition-colors hover:bg-accent sm:min-h-9 sm:py-2"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const newIds = [...(filters.tag_ids ?? []), tag.id];
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
                        t.nombre.toLowerCase().includes(tagSearch.toLowerCase()) &&
                        !(filters.tag_ids ?? []).includes(t.id)
                    ).length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-[10rem] flex-1 basis-[min(100%,12rem)] space-y-1">
              <Label className="text-xs text-muted-foreground">Período</Label>
              <Select
                value={filters.periodo ?? "mes_actual"}
                onValueChange={(v) =>
                  onFiltersChange({ ...filters, periodo: v as TransactionPeriod })
                }
              >
                <SelectTrigger className="h-11 min-h-11 w-full min-w-0 touch-manipulation text-xs sm:h-8 sm:min-h-8">
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

            <div className="flex min-h-[44px] min-w-[9rem] shrink-0 flex-wrap items-center gap-x-4 gap-y-2 pb-0.5">
              <div className="flex min-h-11 items-center gap-2 sm:min-h-8">
                <Checkbox
                  id={idIngresos}
                  checked={filters.showIngresos !== false}
                  onCheckedChange={(v) => onFiltersChange({ ...filters, showIngresos: v === true })}
                  className="h-5 w-5 touch-manipulation border-green-600/45 data-[state=checked]:border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:text-white dark:border-green-500/55"
                />
                <Label
                  htmlFor={idIngresos}
                  className="min-h-11 cursor-pointer whitespace-nowrap py-2 text-xs font-normal leading-none sm:min-h-0 sm:py-0"
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
                  className="min-h-11 cursor-pointer whitespace-nowrap py-2 text-xs font-normal leading-none sm:min-h-0 sm:py-0"
                >
                  Gastos
                </Label>
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
