"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as LucideIcons from "lucide-react";
import {
  Plus, Pencil, PowerOff, FolderOpen, Search, Loader2, AlertTriangle, Smile, Power,
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

const CATEGORY_ICONS = [
  "Utensils", "UtensilsCrossed", "Coffee", "Pizza", "Apple", "Sandwich", "IceCream2", "Wine",
  "ShoppingCart", "ShoppingBag", "Store", "Tag",
  "Car", "Bus", "Train", "Bike", "Plane", "Fuel", "Taxi",
  "Home", "Building2", "Sofa", "Lightbulb", "Wrench", "Hammer", "Drill", "Trash2",
  "Heart", "Activity", "Stethoscope", "Pill", "Cross", "Ambulance",
  "GraduationCap", "BookOpen", "School", "Book", "Pencil",
  "Shirt", "Footprints", "Scissors",
  "Gamepad2", "Music", "Film", "Tv", "Camera", "Headphones", "Ticket",
  "Smartphone", "Laptop", "Monitor", "Cpu", "Wifi",
  "Dumbbell", "Trophy", "PersonStanding", "Wind",
  "DollarSign", "CreditCard", "Wallet", "PiggyBank", "Banknote", "Receipt",
  "TrendingUp", "TrendingDown", "ArrowLeftRight",
  "Gift", "Package", "Star", "Globe", "MapPin",
  "Users", "User", "Baby", "Dog", "Cat",
  "Palette", "Leaf", "TreePine", "Flower",
  "Zap", "Sun", "Moon", "Cloud", "Umbrella",
  "Briefcase", "Landmark", "Building",
];

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
  const [iconSearch, setIconSearch] = useState("");
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

  const filteredIcons = CATEGORY_ICONS.filter((icon) =>
    icon.toLowerCase().includes(iconSearch.toLowerCase())
  );

  const openCreate = () => {
    setEditingCategory(null);
    setSelectedIcon(null);
    setIconSearch("");
    reset({ nombre: "" });
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setSelectedIcon(cat.icono ?? null);
    setIconSearch("");
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
              className={`flex items-center gap-2 rounded-full border px-4 py-2 transition-opacity ${
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
        <DialogContent className="sm:max-w-lg">
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
              <Label className="flex items-center gap-2">
                Ícono
                {selectedIcon && (
                  <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <DynamicIcon name={selectedIcon} className="h-3.5 w-3.5" />
                    {selectedIcon}
                    <button
                      type="button"
                      className="text-destructive hover:underline ml-1"
                      onClick={() => setSelectedIcon(null)}
                    >
                      quitar
                    </button>
                  </span>
                )}
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar ícono..."
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="grid grid-cols-9 gap-1.5 max-h-44 overflow-y-auto rounded-md border p-2 bg-muted/30">
                {filteredIcons.map((iconName) => {
                  const isSelected = selectedIcon === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      title={iconName}
                      onClick={() => setSelectedIcon(isSelected ? null : iconName)}
                      className={`flex items-center justify-center rounded-md p-2 transition-colors hover:bg-accent ${
                        isSelected ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""
                      }`}
                    >
                      <DynamicIcon name={iconName} className="h-4 w-4" />
                    </button>
                  );
                })}
                {filteredIcons.length === 0 && (
                  <div className="col-span-9 flex items-center justify-center py-4 text-xs text-muted-foreground">
                    <Smile className="h-4 w-4 mr-1" /> Sin resultados
                  </div>
                )}
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
