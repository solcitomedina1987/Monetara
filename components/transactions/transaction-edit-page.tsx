"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, X, Loader2 } from "lucide-react";
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
  const [allTags, setAllTags] = useState(initialTags);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(transaction.tags?.map((t) => t.id) ?? []);
  const [tagInput, setTagInput] = useState("");
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

  const handleAddTag = async () => {
    const name = tagInput.trim();
    if (!name) return;
    try {
      const tag = await upsertTag(name);
      if (!allTags.find((t) => t.id === tag.id)) setAllTags((prev) => [...prev, tag]);
      if (!selectedTagIds.includes(tag.id)) setSelectedTagIds((prev) => [...prev, tag.id]);
      setTagInput("");
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
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
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
              <Label>Etiquetas</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Etiqueta..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedTagIds.map((id) => {
                  const tag = allTags.find((t) => t.id === id);
                  return tag ? (
                    <Badge key={id} variant="secondary" className="gap-1">
                      {tag.nombre}
                      <button type="button" onClick={() => setSelectedTagIds((p) => p.filter((tid) => tid !== id))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
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
