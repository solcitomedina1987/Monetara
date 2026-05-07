"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, PowerOff, Power, FolderOpen, Search, X, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  createCategory, updateCategory, deactivateCategory, getCategoryTransactionCount,
} from "@/app/actions/categories";
import { upsertTag } from "@/app/actions/tags";
import { toast } from "@/hooks/use-toast";
import type { Category, Tag } from "@/lib/types";

const schema = z.object({ nombre: z.string().min(2, "Mínimo 2 caracteres") });
type FormData = z.infer<typeof schema>;

interface CategoriesClientProps {
  initialCategories: Category[];
  availableTags: Tag[];
}

export function CategoriesClient({ initialCategories, availableTags }: CategoriesClientProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [allTags, setAllTags] = useState(availableTags);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
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

  const openCreate = () => {
    setEditingCategory(null);
    setSelectedTagIds([]);
    reset({ nombre: "" });
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setSelectedTagIds(cat.tags?.map((t) => t.id) ?? []);
    reset({ nombre: cat.nombre });
    setDialogOpen(true);
  };

  const handleAddTag = async () => {
    const name = tagInput.trim();
    if (!name) return;

    const existing = allTags.find((t) => t.nombre.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selectedTagIds.includes(existing.id)) {
        setSelectedTagIds((prev) => [...prev, existing.id]);
      }
      setTagInput("");
      return;
    }

    try {
      const newTag = await upsertTag(name);
      setAllTags((prev) => [...prev, newTag]);
      setSelectedTagIds((prev) => [...prev, newTag.id]);
      setTagInput("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        if (editingCategory) {
          const updated = await updateCategory(editingCategory.id, data.nombre, selectedTagIds);
          setCategories((prev) => prev.map((c) => c.id === updated.id ? {
            ...updated,
            tags: allTags.filter((t) => selectedTagIds.includes(t.id)),
          } : c));
          toast({ title: "Categoría actualizada" });
        } else {
          const created = await createCategory(data.nombre, selectedTagIds);
          setCategories((prev) => [...prev, {
            ...created,
            tags: allTags.filter((t) => selectedTagIds.includes(t.id)),
          }]);
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

  const confirmDeactivate = () => {
    if (!deactivatingCategory) return;
    startTransition(async () => {
      try {
        await deactivateCategory(deactivatingCategory.id);
        setCategories((prev) => prev.map((c) =>
          c.id === deactivatingCategory.id ? { ...c, estado: "inactivo" } : c
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cat) => (
            <Card key={cat.id} className={cat.estado === "inactivo" ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">{cat.nombre}</CardTitle>
                  </div>
                  <Badge variant={cat.estado === "activo" ? "success" : "secondary"} className="text-xs">
                    {cat.estado}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1 mb-3 min-h-6">
                  {cat.tags?.map((tag) => (
                    <Badge key={tag.id} variant="outline" className="text-xs">{tag.nombre}</Badge>
                  ))}
                  {(!cat.tags || cat.tags.length === 0) && (
                    <span className="text-xs text-muted-foreground">Sin etiquetas</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(cat)} className="flex-1">
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  {cat.estado === "activo" && (
                    <Button
                      variant="outline" size="sm"
                      onClick={() => openDeactivate(cat)}
                      className="text-destructive hover:text-destructive"
                    >
                      <PowerOff className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
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
              <Label>Etiquetas</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Escribí una etiqueta y presioná Enter"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedTagIds.map((tagId) => {
                  const tag = allTags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <Badge key={tagId} variant="secondary" className="gap-1">
                      {tag.nombre}
                      <button
                        type="button"
                        onClick={() => setSelectedTagIds((prev) => prev.filter((id) => id !== tagId))}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
              {allTags.filter((t) => !selectedTagIds.includes(t.id)).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Etiquetas existentes:</p>
                  <div className="flex flex-wrap gap-1">
                    {allTags.filter((t) => !selectedTagIds.includes(t.id)).map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setSelectedTagIds((prev) => [...prev, tag.id])}
                        className="text-xs px-2 py-0.5 rounded-md border hover:bg-accent transition-colors"
                      >
                        + {tag.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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

      {/* Deactivate confirmation dialog */}
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
