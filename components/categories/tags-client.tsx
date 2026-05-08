"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, PowerOff, Tag, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { createTag, updateTag, deactivateTag } from "@/app/actions/tags";
import { toast } from "@/hooks/use-toast";
import type { Tag as TagType } from "@/lib/types";

const schema = z.object({ nombre: z.string().min(2, "Mínimo 2 caracteres") });
type FormData = z.infer<typeof schema>;

export function TagsClient({ initialTags }: { initialTags: TagType[] }) {
  const [tags, setTags] = useState(initialTags);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagType | null>(null);
  const [isPending, startTransition] = useTransition();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const filtered = tags.filter((t) =>
    t.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingTag(null);
    reset({ nombre: "" });
    setDialogOpen(true);
  };

  const openEdit = (tag: TagType) => {
    setEditingTag(tag);
    reset({ nombre: tag.nombre });
    setDialogOpen(true);
  };

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        if (editingTag) {
          const updated = await updateTag(editingTag.id, data.nombre);
          setTags((prev) => prev.map((t) => t.id === updated.id ? updated : t));
          toast({ title: "Etiqueta actualizada" });
        } else {
          const created = await createTag(data.nombre);
          setTags((prev) => [...prev, created]);
          toast({ title: "Etiqueta creada" });
        }
        setDialogOpen(false);
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const handleDeactivate = (tag: TagType) => {
    startTransition(async () => {
      try {
        await deactivateTag(tag.id);
        setTags((prev) => prev.map((t) => t.id === tag.id ? { ...t, estado: "inactivo" } : t));
        toast({ title: "Etiqueta desactivada" });
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Etiquetas</h1>
          <p className="text-sm text-muted-foreground">{tags.filter((t) => t.estado === "activo").length} activas</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nueva Etiqueta
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar etiqueta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Tag className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No hay etiquetas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-3">
          {filtered.map((tag) => (
            <div
              key={tag.id}
              className={`flex items-center gap-2 rounded-full border bg-white dark:bg-card px-4 py-2 transition-opacity ${
                tag.estado === "inactivo" ? "opacity-50" : ""
              }`}
            >
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">{tag.nombre}</span>
              <Badge variant={tag.estado === "activo" ? "success" : "secondary"} className="text-xs px-1.5 py-0">
                {tag.estado}
              </Badge>
              <div className="flex gap-1 ml-1">
                <button
                  onClick={() => openEdit(tag)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {tag.estado === "activo" && (
                  <button
                    onClick={() => handleDeactivate(tag)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    disabled={isPending}
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingTag ? "Editar Etiqueta" : "Nueva Etiqueta"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input placeholder="Ej: urgente, personal, trabajo..." {...register("nombre")} />
              {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingTag ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
