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
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatCurrency } from "@/lib/utils";
import {
  calculateProgressPercent,
  isOverBudget,
} from "@/lib/budget-calculations";
import {
  formatPlanningMonthLabel,
  getDefaultPlanningPeriod,
  shiftPlanningPeriod,
} from "@/lib/budget-planning";
import {
  createBudgetCategory,
  deleteBudgetCategory,
  getBudgetsPageData,
  getLinkedCategoryIds,
  updateBudgetCategory,
} from "@/app/actions/budgets";
import { toast } from "@/hooks/use-toast";
import type { BudgetMonthSummary, Category } from "@/lib/types";

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

const categorySchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  percentage: z
    .number({ error: "Ingresá un porcentaje" })
    .min(0, "Mínimo 0%")
    .max(100, "Máximo 100%"),
});
type CategoryFormData = z.infer<typeof categorySchema>;

interface BudgetsClientProps {
  initialSummary: BudgetMonthSummary;
  expenseCategories: Category[];
  initialMonth: number;
  initialYear: number;
}

export function BudgetsClient({
  initialSummary,
  expenseCategories,
  initialMonth,
  initialYear,
}: BudgetsClientProps) {
  const defaultPeriod = getDefaultPlanningPeriod();
  const [summary, setSummary] = useState(initialSummary);
  const [expenseCategoriesState, setExpenseCategoriesState] = useState(expenseCategories);
  const [planMonth, setPlanMonth] = useState(initialMonth ?? defaultPeriod.month);
  const [planYear, setPlanYear] = useState(initialYear ?? defaultPeriod.year);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [linkedCategoryIds, setLinkedCategoryIds] = useState<string[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", percentage: 0 },
  });

  const percentageValue = watch("percentage");

  const loadSummary = useCallback(async (month: number, year: number) => {
    setLoadingMonth(true);
    try {
      const data = await getBudgetsPageData(month, year);
      setSummary(data.summary);
      setExpenseCategoriesState(data.expenseCategories);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al cargar presupuestos";
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setLoadingMonth(false);
    }
  }, []);

  useEffect(() => {
    loadSummary(planMonth, planYear);
  }, [planMonth, planYear, loadSummary]);

  const shiftMonth = (delta: -1 | 1) => {
    const next = shiftPlanningPeriod(planMonth, planYear, delta);
    setPlanMonth(next.month);
    setPlanYear(next.year);
  };

  const deleteTarget = useMemo(
    () => summary.categories.find((c) => c.id === deleteTargetId) ?? null,
    [summary.categories, deleteTargetId]
  );

  /** Categorías de gasto disponibles para vincular (activas) */
  const linkableExpenseCategories = expenseCategoriesState;

  const openCreateCategory = () => {
    setEditingCategoryId(null);
    setSelectedIcon(BUDGET_ICON_NAMES[0]);
    setLinkedCategoryIds([]);
    reset({ name: "", percentage: 0 });
    setCategoryDialogOpen(true);
  };

  const openEditCategory = async (id: string) => {
    const row = summary.categories.find((c) => c.id === id);
    if (!row) return;
    setEditingCategoryId(id);
    setSelectedIcon(row.icon ?? BUDGET_ICON_NAMES[0]);
    reset({ name: row.name, percentage: row.percentage });
    try {
      const ids = await getLinkedCategoryIds(id);
      setLinkedCategoryIds(ids);
    } catch {
      setLinkedCategoryIds(row.linkedCategories.map((c) => c.id));
    }
    setCategoryDialogOpen(true);
  };

  const toggleLinkedCategory = (categoryId: string) => {
    setLinkedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const onCategorySubmit = (data: CategoryFormData) => {
    startTransition(async () => {
      try {
        const payload = {
          name: data.name,
          icon: selectedIcon,
          percentage: data.percentage,
          linkedCategoryIds,
        };
        if (editingCategoryId) {
          await updateBudgetCategory(editingCategoryId, payload);
          toast({ title: "Presupuesto actualizado" });
        } else {
          await createBudgetCategory(payload);
          toast({ title: "Presupuesto creado" });
        }
        setCategoryDialogOpen(false);
        await loadSummary(planMonth, planYear);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error al guardar";
        toast({ variant: "destructive", title: "Error", description: message });
      }
    });
  };

  const confirmDeleteCategory = () => {
    if (!deleteTargetId) return;
    startTransition(async () => {
      try {
        await deleteBudgetCategory(deleteTargetId);
        toast({ title: "Presupuesto eliminado" });
        setDeleteTargetId(null);
        await loadSummary(planMonth, planYear);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error al eliminar";
        toast({ variant: "destructive", title: "Error", description: message });
      }
    });
  };

  const monthLabel = formatPlanningMonthLabel(planMonth, planYear);
  const assignedPercent = summary.totalAssignedPercent;
  const percentOverAssigned = assignedPercent > 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Presupuestos</h1>
          <p className="text-sm text-muted-foreground">
            Asigná un porcentaje de tus ingresos mensuales y seguí el gasto real por grupo.
          </p>
        </div>
        <Button onClick={openCreateCategory} className="shrink-0 touch-manipulation">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo presupuesto
        </Button>
      </div>

      {/* Control de mes unificado */}
      <Card className="border-[#0e415f]/15">
        <CardContent className="flex flex-col items-center gap-4 p-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
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
            <div className="min-w-[11rem] text-center">
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
        </CardContent>
      </Card>

      {/* Métricas superiores */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-[#0e415f]/20 bg-gradient-to-br from-[#f4f0e0]/40 via-card to-card dark:from-[#0e415f]/10">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5 text-green-600" />
              Ingresos del mes (100% a distribuir)
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums text-[#0e415f] dark:text-[#f4f0e0]">
              {formatCurrency(summary.totalIncome)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Límite de cada presupuesto = ingreso × porcentaje asignado
            </p>
          </CardHeader>
        </Card>
        <Card className={cn(percentOverAssigned && "border-red-300/60 bg-red-50/30 dark:bg-red-950/10")}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <PiggyBank className="h-3.5 w-3.5" />
              Porcentaje asignado
            </CardDescription>
            <CardTitle
              className={cn(
                "text-2xl tabular-nums",
                percentOverAssigned ? "text-red-600 dark:text-red-400" : "text-foreground"
              )}
            >
              {assignedPercent.toLocaleString("es-AR", { maximumFractionDigits: 2 })}% / 100%
            </CardTitle>
            {percentOverAssigned && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Superás el 100% disponible. Ajustá los porcentajes.
              </p>
            )}
          </CardHeader>
        </Card>
      </div>

      {summary.categories.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center text-muted-foreground">
            <PiggyBank className="h-12 w-12 opacity-30" />
            <div>
              <p className="text-lg font-medium text-foreground">
                {loadingMonth ? "Cargando…" : "Sin presupuestos para este mes"}
              </p>
              <p className="mt-1 max-w-md text-sm">
                Los presupuestos solo aparecen desde el mes en que los creás. Si retrocedés a un mes
                anterior, no se mostrarán categorías que aún no existían.
              </p>
            </div>
            <Button onClick={openCreateCategory}>
              <Plus className="mr-2 h-4 w-4" />
              Crear presupuesto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {summary.categories.map((row) => {
            const progress = calculateProgressPercent(row.spentAmount, row.limitAmount);
            const over = isOverBudget(row.spentAmount, row.limitAmount);

            return (
              <Card
                key={row.id}
                className="overflow-hidden border-border/70 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]"
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#0e415f]/15 bg-[#f4f0e0]/60 text-[#0e415f] dark:bg-[#0e415f]/20 dark:text-[#f4f0e0]">
                        <DynamicBudgetIcon iconName={row.icon} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {row.name}{" "}
                          <span className="font-normal text-muted-foreground">
                            ({row.percentage.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%)
                          </span>
                        </p>
                        <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(row.spentAmount)} gastados de{" "}
                          {formatCurrency(row.limitAmount)} de límite
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditCategory(row.id)}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTargetId(row.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
                      <span>{progress.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%</span>
                      {over && (
                        <span className="font-medium text-red-600 dark:text-red-400">
                          Excedido en {formatCurrency(row.spentAmount - row.limitAmount)}
                        </span>
                      )}
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          over ? "bg-red-500" : "bg-green-600 dark:bg-green-500"
                        )}
                        style={{
                          width: `${row.limitAmount > 0 ? Math.min(100, progress) : 0}%`,
                        }}
                      />
                    </div>
                    {row.limitAmount <= 0 && summary.totalIncome <= 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Sin ingresos registrados en {monthLabel}: límite $0
                      </p>
                    )}
                  </div>

                  {row.linkedCategories.length > 0 ? (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground/80">Categorías: </span>
                      {row.linkedCategories.map((c) => c.nombre).join(", ")}
                    </p>
                  ) : (
                    <p className="text-[11px] italic text-muted-foreground">
                      Sin categorías de gasto vinculadas
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal crear / editar */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCategoryId ? "Editar presupuesto" : "Nuevo presupuesto"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCategorySubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="budget-cat-name">Nombre</Label>
              <Input
                id="budget-cat-name"
                placeholder="Ej: Hogar, Tarjetas de Crédito..."
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget-cat-pct">Porcentaje del ingreso mensual</Label>
              <div className="relative">
                <NumericFormat
                  id="budget-cat-pct"
                  customInput={Input}
                  decimalSeparator=","
                  decimalScale={2}
                  allowNegative={false}
                  isAllowed={(v) => (v.floatValue ?? 0) <= 100}
                  inputMode="decimal"
                  placeholder="0"
                  className="pr-8 tabular-nums"
                  value={percentageValue ?? ""}
                  onValueChange={(vals) =>
                    setValue("percentage", vals.floatValue ?? 0, { shouldValidate: true })
                  }
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
              {errors.percentage && (
                <p className="text-xs text-destructive">{errors.percentage.message}</p>
              )}
              {summary.totalIncome > 0 && percentageValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Límite estimado este mes:{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCurrency(summary.totalIncome * (percentageValue / 100))}
                  </span>
                </p>
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
                      className={cn(
                        "flex items-center justify-center rounded-md p-2 transition-colors",
                        selected
                          ? "bg-[#0e415f] text-white ring-2 ring-[#0e415f] ring-offset-1 dark:bg-[#f4f0e0] dark:text-[#0e415f]"
                          : "text-foreground/70 hover:bg-accent"
                      )}
                    >
                      <DynamicBudgetIcon iconName={iconName} className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Categorías de gasto vinculadas</Label>
              <p className="text-xs text-muted-foreground">
                Cada categoría de gasto solo puede pertenecer a un presupuesto.
              </p>
              {linkableExpenseCategories.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No hay categorías de gasto activas. Creá categorías en la sección Categorías.
                </p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {linkableExpenseCategories.map((cat) => {
                    const checked = linkedCategoryIds.includes(cat.id);
                    const linkedElsewhere =
                      cat.budget_category_id &&
                      cat.budget_category_id !== editingCategoryId;
                    return (
                      <label
                        key={cat.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50",
                          linkedElsewhere && !checked && "opacity-50"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleLinkedCategory(cat.id)}
                        />
                        <span className="flex-1 truncate">{cat.nombre}</span>
                        {linkedElsewhere && !checked && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            (en otro presupuesto)
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCategoryId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar presupuesto</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Eliminar <strong>{deleteTarget?.name}</strong>? Se desvincularán las categorías de
            gasto asociadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
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
