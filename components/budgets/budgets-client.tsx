"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as LucideIcons from "lucide-react";
import type { ElementType } from "react";
import { NumericFormat } from "react-number-format";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import {
  formatPlanningMonthLabel,
  getDefaultPlanningPeriod,
  shiftPlanningPeriod,
} from "@/lib/budget-planning";
import {
  createBudgetCategory,
  deleteBudgetCategory,
  getBudgetsForMonth,
  saveBudgetsForMonth,
  updateBudgetCategory,
} from "@/app/actions/budgets";
import { toast } from "@/hooks/use-toast";
import type { Budget, BudgetCategory } from "@/lib/types";

const BUDGET_ICON_NAMES = [
  "CreditCard",
  "Home",
  "UtensilsCrossed",
  "Car",
  "ShoppingBag",
  "Heart",
  "Gamepad2",
  "GraduationCap",
  "Plane",
  "Gift",
  "Smartphone",
  "Zap",
  "Droplet",
  "Building2",
  "PiggyBank",
  "Wallet",
  "Music",
  "Dumbbell",
  "Baby",
  "Scissors",
  "Coffee",
  "Bus",
  "Shirt",
  "Briefcase",
  "Receipt",
  "Sparkles",
] as const;

function DynamicBudgetIcon({
  iconName,
  className,
}: {
  iconName: string | null | undefined;
  className?: string;
}) {
  const cls = className ?? "h-5 w-5";
  if (!iconName) return <FolderOpen className={cls} />;
  const IconComponent = (LucideIcons as any)[iconName] as ElementType<{ className?: string }>;
  if (!IconComponent) return <FolderOpen className={cls} />;
  return <IconComponent className={cls} />;
}

function budgetsToAmountMap(budgets: Budget[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const b of budgets) {
    map[b.budget_category_id] = Number(b.amount);
  }
  return map;
}

const categorySchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
});
type CategoryFormData = z.infer<typeof categorySchema>;

interface BudgetsClientProps {
  initialCategories: BudgetCategory[];
  initialBudgets: Budget[];
  initialMonth: number;
  initialYear: number;
}

export function BudgetsClient({
  initialCategories,
  initialBudgets,
  initialMonth,
  initialYear,
}: BudgetsClientProps) {
  const defaultPeriod = getDefaultPlanningPeriod();
  const [categories, setCategories] = useState(initialCategories);
  const [planMonth, setPlanMonth] = useState(initialMonth ?? defaultPeriod.month);
  const [planYear, setPlanYear] = useState(initialYear ?? defaultPeriod.year);
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    budgetsToAmountMap(initialBudgets)
  );
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BudgetCategory | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
  });

  const loadBudgets = useCallback(async (month: number, year: number) => {
    setLoadingMonth(true);
    try {
      const budgets = await getBudgetsForMonth(month, year);
      setAmounts(budgetsToAmountMap(budgets));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al cargar presupuestos";
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setLoadingMonth(false);
    }
  }, []);

  useEffect(() => {
    loadBudgets(planMonth, planYear);
  }, [planMonth, planYear, loadBudgets]);

  const totalBudgeted = useMemo(
    () =>
      Math.round(
        categories.reduce((sum, cat) => sum + (amounts[cat.id] ?? 0), 0) * 100
      ) / 100,
    [categories, amounts]
  );

  const shiftMonth = (delta: -1 | 1) => {
    const next = shiftPlanningPeriod(planMonth, planYear, delta);
    setPlanMonth(next.month);
    setPlanYear(next.year);
  };

  const openCreateCategory = () => {
    setEditingCategory(null);
    setSelectedIcon(BUDGET_ICON_NAMES[0]);
    reset({ name: "" });
    setCategoryDialogOpen(true);
  };

  const openEditCategory = (cat: BudgetCategory) => {
    setEditingCategory(cat);
    setSelectedIcon(cat.icon ?? BUDGET_ICON_NAMES[0]);
    reset({ name: cat.name });
    setCategoryDialogOpen(true);
  };

  const onCategorySubmit = (data: CategoryFormData) => {
    startTransition(async () => {
      try {
        if (editingCategory) {
          const updated = await updateBudgetCategory(editingCategory.id, data.name, selectedIcon);
          setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          toast({ title: "Categoría actualizada" });
        } else {
          const created = await createBudgetCategory(data.name, selectedIcon);
          setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
          toast({ title: "Categoría creada" });
        }
        setCategoryDialogOpen(false);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error al guardar categoría";
        toast({ variant: "destructive", title: "Error", description: message });
      }
    });
  };

  const confirmDeleteCategory = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteBudgetCategory(deleteTarget.id);
        setCategories((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        setAmounts((prev) => {
          const next = { ...prev };
          delete next[deleteTarget.id];
          return next;
        });
        toast({ title: "Categoría eliminada" });
        setDeleteTarget(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error al eliminar";
        toast({ variant: "destructive", title: "Error", description: message });
      }
    });
  };

  const handleSaveBudgets = () => {
    startTransition(async () => {
      try {
        const entries = categories.map((cat) => ({
          budget_category_id: cat.id,
          amount: amounts[cat.id] ?? 0,
        }));
        await saveBudgetsForMonth(planMonth, planYear, entries);
        toast({
          title: "Presupuesto guardado",
          description: formatPlanningMonthLabel(planMonth, planYear),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error al guardar";
        toast({ variant: "destructive", title: "Error", description: message });
      }
    });
  };

  const monthLabel = formatPlanningMonthLabel(planMonth, planYear);

  return (
    <div className="space-y-6">
      {/* Encabezado + navegación de mes */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Presupuestos</h1>
          <p className="text-sm text-muted-foreground">
            Planificá tus gastos del mes siguiente y asigná montos por categoría.
          </p>
        </div>
        <Button onClick={openCreateCategory} className="shrink-0 touch-manipulation">
          <Plus className="mr-2 h-4 w-4" />
          Nueva categoría
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 sm:justify-start">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 touch-manipulation"
          aria-label="Mes anterior"
          onClick={() => shiftMonth(-1)}
          disabled={loadingMonth}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-[10rem] text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Planificando
          </p>
          <p className="text-lg font-semibold capitalize text-[#0e415f] dark:text-[#f4f0e0]">
            {monthLabel}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 touch-manipulation"
          aria-label="Mes siguiente"
          onClick={() => shiftMonth(1)}
          disabled={loadingMonth}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        {loadingMonth && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Métricas rápidas */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-[#0e415f]/20 bg-gradient-to-br from-[#f4f0e0]/40 via-card to-card dark:from-[#0e415f]/10">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <PiggyBank className="h-3.5 w-3.5 text-[#0e415f] dark:text-[#f4f0e0]" />
              Total presupuestado
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums text-[#0e415f] dark:text-[#f4f0e0]">
              {formatCurrency(totalBudgeted)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Gasto real acumulado</CardDescription>
            <CardTitle className="text-lg font-medium text-muted-foreground">Próximamente</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Compará lo proyectado vs lo gastado cuando conectemos tus movimientos.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de categorías + montos */}
      {categories.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center text-muted-foreground">
            <PiggyBank className="h-12 w-12 opacity-30" />
            <div>
              <p className="text-lg font-medium text-foreground">Sin categorías de presupuesto</p>
              <p className="mt-1 max-w-sm text-sm">
                Creá categorías como &quot;Hogar&quot;, &quot;Tarjetas&quot; o &quot;Salidas&quot; y asignales un monto
                para {monthLabel}.
              </p>
            </div>
            <Button onClick={openCreateCategory}>
              <Plus className="mr-2 h-4 w-4" />
              Crear primera categoría
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {categories.map((cat) => (
              <Card
                key={cat.id}
                className="overflow-hidden border-border/70 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]"
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#0e415f]/15 bg-[#f4f0e0]/60 text-[#0e415f] dark:bg-[#0e415f]/20 dark:text-[#f4f0e0]">
                      <DynamicBudgetIcon iconName={cat.icon} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{cat.name}</p>
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditCategory(cat)}
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Pencil className="h-3 w-3" />
                            Editar
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(cat)}
                          className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Trash2 className="h-3 w-3" />
                            Eliminar
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="w-full shrink-0 sm:w-44">
                    <Label htmlFor={`budget-${cat.id}`} className="sr-only">
                      Monto para {cat.name}
                    </Label>
                    <NumericFormat
                      id={`budget-${cat.id}`}
                      customInput={Input}
                      thousandSeparator="."
                      decimalSeparator=","
                      decimalScale={2}
                      allowNegative={false}
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={loadingMonth || isPending}
                      className="h-11 text-right text-base font-semibold tabular-nums touch-manipulation sm:h-10"
                      value={amounts[cat.id] ?? ""}
                      onValueChange={(vals) =>
                        setAmounts((prev) => ({
                          ...prev,
                          [cat.id]: vals.floatValue ?? 0,
                        }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="sticky bottom-4 z-10 flex justify-end pt-2">
            <Button
              size="lg"
              onClick={handleSaveBudgets}
              disabled={isPending || loadingMonth}
              className="min-h-12 w-full touch-manipulation shadow-lg sm:w-auto sm:min-h-10 bg-[#0e415f] hover:bg-[#1f628e] text-white dark:bg-[#f4f0e0] dark:text-[#0e415f] dark:hover:bg-[#e8e4d4]"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar presupuesto
            </Button>
          </div>
        </>
      )}

      {/* Modal categoría */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Editar categoría" : "Nueva categoría de presupuesto"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCategorySubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="budget-cat-name">Nombre</Label>
              <Input
                id="budget-cat-name"
                placeholder="Ej: Tarjetas de Crédito, Hogar..."
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Ícono</Label>
              <div className="grid grid-cols-6 gap-1.5 rounded-lg border bg-muted/20 p-2 sm:grid-cols-8">
                {BUDGET_ICON_NAMES.map((iconName) => {
                  const selected = selectedIcon === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      title={iconName}
                      aria-label={iconName}
                      onClick={() => setSelectedIcon(iconName)}
                      className={`flex items-center justify-center rounded-md p-2 transition-colors ${
                        selected
                          ? "bg-[#0e415f] text-white ring-2 ring-[#0e415f] ring-offset-1 dark:bg-[#f4f0e0] dark:text-[#0e415f] dark:ring-[#f4f0e0]"
                          : "text-foreground/70 hover:bg-accent"
                      }`}
                    >
                      <DynamicBudgetIcon iconName={iconName} className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCategory ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar categoría</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Eliminar <strong>{deleteTarget?.name}</strong>? Se borrarán también los presupuestos
            asociados en todos los meses.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCategory} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
