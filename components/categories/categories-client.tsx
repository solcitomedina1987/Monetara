"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as LucideIcons from "lucide-react";
import {
  Plus, Pencil, PowerOff, FolderOpen, Search, Loader2, AlertTriangle, Power,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  createCategory, updateCategory, deactivateCategory, getCategoryTransactionCount,
} from "@/app/actions/categories";
import { toast } from "@/hooks/use-toast";
import type { Category } from "@/lib/types";

// Build the full Lucide icon list at module level (excludes non-component exports)
const ALL_LUCIDE_ICONS: string[] = Object.keys(LucideIcons).filter((key) => {
  if (!(/^[A-Z]/).test(key)) return false;           // must start with uppercase
  if (key === "createLucideIcon") return false;
  const val = (LucideIcons as any)[key];
  return typeof val === "function";
});

const ICONS_PER_PAGE = 100; // 10 cols (desktop) × 10 rows

function DynamicIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const cls = className ?? "h-3.5 w-3.5";
  if (!name) return <FolderOpen className={cls} />;
  const IconComponent = (LucideIcons as any)[name] as React.FC<{ className?: string }>;
  if (!IconComponent) return <FolderOpen className={cls} />;
  return <IconComponent className={cls} />;
}

const schema = z.object({ nombre: z.string().min(2, "Mínimo 2 caracteres") });
type FormData = z.infer<typeof schema>;

export function CategoriesClient({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [iconPage, setIconPage] = useState(0);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivatingCategory, setDeactivatingCategory] = useState<Category | null>(null);
  const [deactivateStats, setDeactivateStats] = useState<{ ingresos: number; gastos: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const filtered = categories.filter((c) =>
    c.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const totalIconPages = Math.ceil(ALL_LUCIDE_ICONS.length / ICONS_PER_PAGE);
  const pagedIcons = ALL_LUCIDE_ICONS.slice(iconPage * ICONS_PER_PAGE, (iconPage + 1) * ICONS_PER_PAGE);

  const openCreate = () => {
    setEditingCategory(null);
    setSelectedIcon(null);
    setIconPage(0);
    reset({ nombre: "" });
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setSelectedIcon(cat.icono ?? null);
    // Jump to the page that contains the currently selected icon
    if (cat.icono) {
      const idx = ALL_LUCIDE_ICONS.indexOf(cat.icono);
      setIconPage(idx >= 0 ? Math.floor(idx / ICONS_PER_PAGE) : 0);
    } else {
      setIconPage(0);
    }
    reset({ nombre: cat.nombre });
    setDialogOpen(true);
  };

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        if (editingCategory) {
          const updated = await updateCategory(editingCategory.id, data.nombre, selectedIcon);
          setCategories((prev) => prev.map((c) => c.id === updated.id ? updated : c));
          toast({ title: "Categoría actualizada" });
        } else {
          const created = await createCategory(data.nombre, selectedIcon);
          setCategories((prev) => [...prev, created]);
          toast({ title: "Categoría creada" });
        }
        setDialogOpen(false);
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const openDeactivate = async (cat: Category) => {
    setDeactivatingCategory(cat);
    const stats = await getCategoryTransactionCount(cat.id);
    setDeactivateStats(stats);
    setDeactivateDialogOpen(true);
  };

  const reactivate = (cat: Category) => {
    startTransition(async () => {
      try {
        await updateCategory(cat.id, cat.nombre, cat.icono);
        // Re-fetch via optimistic update
        const supabase = (await import("@/lib/supabase/client")).createClient();
        await supabase.from("categories").update({ estado: "activo" }).eq("id", cat.id);
        setCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, estado: "activo" as const } : c));
        toast({ title: "Categoría activada" });
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const confirmDeactivate = () => {
    if (!deactivatingCategory) return;
    startTransition(async () => {
      try {
        await deactivateCategory(deactivatingCategory.id);
        setCategories((prev) => prev.map((c) =>
          c.id === deactivatingCategory.id ? { ...c, estado: "inactivo" as const } : c
        ));
        toast({ title: "Categoría desactivada" });
        setDeactivateDialogOpen(false);
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categorías</h1>
          <p className="text-sm text-muted-foreground">
            {categories.filter((c) => c.estado === "activo").length} activas
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nueva Categoría
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FolderOpen className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No hay categorías</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-3">
          {filtered.map((cat) => (
            <div
              key={cat.id}
              className={`flex items-center gap-2 rounded-full border bg-white dark:bg-card px-4 py-2 transition-opacity ${
                cat.estado === "inactivo" ? "opacity-50" : ""
              }`}
            >
              <span className="text-primary">
                <DynamicIcon name={cat.icono} className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-medium">{cat.nombre}</span>
              <Badge
                variant={cat.estado === "activo" ? "success" : "secondary"}
                className="text-xs px-1.5 py-0"
              >
                {cat.estado}
              </Badge>
              <div className="flex gap-1 ml-1">
                <button
                  onClick={() => openEdit(cat)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {cat.estado === "activo" ? (
                  <button
                    onClick={() => openDeactivate(cat)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    disabled={isPending}
                    title="Desactivar"
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => reactivate(cat)}
                    className="text-muted-foreground hover:text-green-600 transition-colors"
                    disabled={isPending}
                    title="Activar"
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editar Categoría" : "Nueva Categoría"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input placeholder="Ej: Alimentación, Transporte..." {...register("nombre")} />
              {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
            </div>

            <div className="space-y-2">
              {/* Header: label + selected icon badge */}
              <div className="flex items-center justify-between">
                <Label>Ícono</Label>
                {selectedIcon ? (
                  <span className="flex items-center gap-1.5 rounded-full border bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    <DynamicIcon name={selectedIcon} className="h-3.5 w-3.5" />
                    {selectedIcon}
                    <button
                      type="button"
                      aria-label="Quitar ícono"
                      className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                      onClick={() => setSelectedIcon(null)}
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin ícono seleccionado</span>
                )}
              </div>

              {/* Icon grid — 10 cols desktop / 5 cols mobile */}
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 rounded-lg border bg-muted/20 p-2">
                {pagedIcons.map((iconName) => {
                  const isSelected = selectedIcon === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      title={iconName}
                      aria-label={iconName}
                      onClick={() => setSelectedIcon(isSelected ? null : iconName)}
                      className={`flex items-center justify-center rounded-md p-2 transition-all hover:scale-110 hover:bg-accent ${
                        isSelected
                          ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 hover:bg-primary/90 scale-110"
                          : "text-foreground/70"
                      }`}
                    >
                      <DynamicIcon name={iconName} className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1"
                  disabled={iconPage === 0}
                  onClick={() => setIconPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </Button>

                <span className="text-xs text-muted-foreground tabular-nums">
                  Página {iconPage + 1} de {totalIconPages}
                  <span className="hidden sm:inline"> · {ALL_LUCIDE_ICONS.length.toLocaleString()} íconos</span>
                </span>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1"
                  disabled={iconPage >= totalIconPages - 1}
                  onClick={() => setIconPage((p) => Math.min(totalIconPages - 1, p + 1))}
                >
                  Siguiente
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCategory ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation */}
      <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Desactivar Categoría
            </DialogTitle>
          </DialogHeader>
          {deactivateStats && (deactivateStats.ingresos > 0 || deactivateStats.gastos > 0) ? (
            <div className="rounded-lg bg-warning/10 border border-warning/20 p-4 text-sm space-y-1">
              <p className="font-medium">Esta categoría tiene movimientos en el último año:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                {deactivateStats.ingresos > 0 && <li>{deactivateStats.ingresos} ingreso(s) asociado(s)</li>}
                {deactivateStats.gastos > 0 && <li>{deactivateStats.gastos} gasto(s) asociado(s)</li>}
              </ul>
              <p className="mt-2 text-muted-foreground">
                La baja <strong>no modificará</strong> los movimientos existentes, pero <strong>impedirá</strong> cargar nuevos movimientos con esta categoría.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              ¿Estás seguro que querés desactivar la categoría <strong>{deactivatingCategory?.nombre}</strong>?
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeactivate} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desactivar de todas formas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
