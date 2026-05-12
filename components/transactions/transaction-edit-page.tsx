"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, X, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateTransaction } from "@/app/actions/transactions";
import { upsertTag } from "@/app/actions/tags";
import { toast } from "@/hooks/use-toast";
import type { Account, Category, Tag, TransactionWithRelations, TransactionType } from "@/lib/types";

const schema = z.object({
  monto: z.coerce.number().positive("Debe ser mayor a 0"),
  account_id: z.string().min(1, "Seleccioná una cuenta"),
  to_account_id: z.string().optional(),
  category_id: z.string().optional(),
  fecha: z.string().min(1),
  notas: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  transaction: TransactionWithRelations;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
}

export function TransactionEditPage({ transaction, accounts, categories, tags: initialTags }: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TransactionType>(transaction.tipo);
  const [allTags, setAllTags] = useState<Tag[]>(() => {
    const byId = new Map<string, Tag>();
    initialTags.forEach((t) => byId.set(t.id, t));
    transaction.tags?.forEach((t) => byId.set(t.id, t));
    return Array.from(byId.values());
  });
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(transaction.tags?.map((t) => t.id) ?? []);
  const [tagInput, setTagInput] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      monto: transaction.monto,
      account_id: transaction.account_id,
      to_account_id: transaction.to_account_id ?? undefined,
      category_id: transaction.category_id ?? undefined,
      fecha: transaction.fecha,
      notas: transaction.notas ?? undefined,
    },
  });

  const filteredTags = allTags.filter(
    (t) =>
      t.estado === "activo" &&
      t.nombre.toLowerCase().includes(tagInput.toLowerCase()) &&
      !selectedTagIds.includes(t.id)
  );
  const showCreateTag =
    tagInput.trim().length >= 2 &&
    !allTags.some((t) => t.nombre.toLowerCase() === tagInput.trim().toLowerCase());

  const selectExistingTag = (tag: Tag) => {
    if (selectedTagIds.includes(tag.id)) return;
    setSelectedTagIds((prev) => [...prev, tag.id]);
    setTagInput("");
    setTagDropdownOpen(false);
    setTimeout(() => tagInputRef.current?.focus(), 0);
  };

  const handleAddTag = async () => {
    const name = tagInput.trim();
    if (!name) return;
    try {
      const tag = await upsertTag(name);
      if (!allTags.find((t) => t.id === tag.id)) setAllTags((prev) => [...prev, tag]);
      if (!selectedTagIds.includes(tag.id)) setSelectedTagIds((prev) => [...prev, tag.id]);
      setTagInput("");
      setTagDropdownOpen(false);
      setTimeout(() => tagInputRef.current?.focus(), 0);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const onSubmit = (data: any) => {
    startTransition(async () => {
      try {
        await updateTransaction(transaction.id, {
          monto: data.monto,
          tipo,
          account_id: data.account_id,
          category_id: tipo !== "transferencia" ? (data.category_id || null) : null,
          fecha: data.fecha,
          notas: data.notas || null,
          to_account_id: tipo === "transferencia" ? (data.to_account_id || null) : null,
          tag_ids: selectedTagIds,
        });
        toast({ title: "Movimiento actualizado" });
        router.push("/transactions");
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 touch-manipulation sm:h-10 sm:w-10"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Editar Movimiento</h1>
      </div>

      <Card>
        <CardHeader>
          <Tabs value={tipo} onValueChange={(v) => setTipo(v as TransactionType)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ingreso">+ Ingreso</TabsTrigger>
              <TabsTrigger value="gasto">- Gasto</TabsTrigger>
              <TabsTrigger value="transferencia">⇄ Transferencia</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label>Monto</Label>
              <Input type="number" step="0.01" className="text-xl font-bold h-14" {...register("monto")} />
              {errors.monto && <p className="text-xs text-destructive">{errors.monto.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Cuenta {tipo === "transferencia" && "de origen"}</Label>
              <Select value={watch("account_id")} onValueChange={(v) => setValue("account_id", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {tipo === "transferencia" && (
              <div className="space-y-2">
                <Label>Cuenta de destino</Label>
                <Select value={watch("to_account_id") ?? ""} onValueChange={(v) => setValue("to_account_id", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.id !== watch("account_id")).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {tipo !== "transferencia" && (
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select
                  value={watch("category_id") || "__none__"}
                  onValueChange={(v) => setValue("category_id", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin categoría</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>
                Etiquetas{" "}
                <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
              </Label>

              {selectedTagIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedTagIds.map((id) => {
                    const tag = allTags.find((t) => t.id === id);
                    return tag ? (
                      <Badge key={id} variant="secondary" className="gap-1 pl-2.5 pr-1.5">
                        {tag.nombre}
                        <button
                          type="button"
                          className="inline-flex min-h-8 min-w-8 touch-manipulation items-center justify-center rounded-sm"
                          onClick={() => setSelectedTagIds((p) => p.filter((tid) => tid !== id))}
                        >
                          <X className="h-3 w-3 hover:text-destructive" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={tagInputRef}
                  className="flex h-11 w-full touch-manipulation rounded-md border bg-background pl-8 pr-3 py-2 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground sm:h-9"
                  placeholder="Buscar o crear etiqueta..."
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setTagDropdownOpen(true);
                  }}
                  onFocus={() => setTagDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setTagDropdownOpen(false), 200)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (tagInput.trim()) handleAddTag();
                    }
                  }}
                />
                {tagDropdownOpen && (filteredTags.length > 0 || showCreateTag || tagInput.trim().length > 0) && (
                  <div
                    className="absolute z-50 mt-1 w-full rounded-md border bg-popover py-1 shadow-md"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {filteredTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className="min-h-11 w-full touch-manipulation px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent sm:min-h-9 sm:py-2"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectExistingTag(tag);
                        }}
                      >
                        {tag.nombre}
                      </button>
                    ))}
                    {showCreateTag && (
                      <button
                        type="button"
                        className="flex min-h-11 w-full touch-manipulation items-center gap-2 px-3 py-2.5 text-left text-sm text-primary transition-colors hover:bg-accent sm:min-h-9 sm:py-2"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAddTag();
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0" />
                        Crear etiqueta "{tagInput.trim()}"
                      </button>
                    )}
                    {filteredTags.length === 0 && !showCreateTag && tagInput.trim().length > 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" {...register("fecha")} />
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea rows={3} {...register("notas")} />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">Cancelar</Button>
              <Button type="submit" disabled={isPending} className="flex-1">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
