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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createTransaction } from "@/app/actions/transactions";
import { createCategory } from "@/app/actions/categories";
import { upsertTag } from "@/app/actions/tags";
import { toast } from "@/hooks/use-toast";
import { toISODateString } from "@/lib/utils";
import type { Account, Category, Tag, TransactionType } from "@/lib/types";

const schema = z.object({
  monto: z.coerce.number().positive("Debe ser mayor a 0"),
  account_id: z.string().min(1, "Seleccioná una cuenta"),
  to_account_id: z.string().optional(),
  category_id: z.string().optional(),
  fecha: z.string().min(1, "Seleccioná una fecha"),
  notas: z.string().optional(),
}).refine((d) => {
  return true;
});

type FormData = z.infer<typeof schema>;

interface Props {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  defaultTipo: TransactionType;
}

export function TransactionFormPage({ accounts, categories: initialCategories, tags: initialTags, defaultTipo }: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TransactionType>(defaultTipo);
  const [categories, setCategories] = useState(initialCategories);
  const [allTags, setAllTags] = useState(initialTags);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [isPending, startTransition] = useTransition();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha: toISODateString(new Date()),
      account_id: accounts[0]?.id ?? "",
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

  const handleCreateCategory = async () => {
    const name = newCategoryInput.trim();
    if (!name) return;
    try {
      const cat = await createCategory(name);
      setCategories((prev) => [...prev, cat]);
      setValue("category_id", cat.id);
      setNewCategoryInput("");
      toast({ title: `Categoría "${name}" creada` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const onSubmit = (data: any) => {
    startTransition(async () => {
      try {
        await createTransaction({
          monto: data.monto,
          tipo,
          account_id: data.account_id,
          category_id: tipo !== "transferencia" ? (data.category_id || null) : null,
          fecha: data.fecha,
          notas: data.notas || null,
          to_account_id: tipo === "transferencia" ? (data.to_account_id || null) : null,
          tag_ids: selectedTagIds,
        });
        toast({
          title: tipo === "ingreso" ? "Ingreso registrado" : tipo === "gasto" ? "Gasto registrado" : "Transferencia registrada",
          variant: tipo === "ingreso" ? "success" : "default",
        });
        router.push("/transactions");
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const tipoColors = {
    ingreso: "text-green-600 dark:text-green-400",
    gasto: "text-red-600 dark:text-red-400",
    transferencia: "text-blue-600 dark:text-blue-400",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Nuevo Movimiento</h1>
      </div>

      <Card>
        <CardHeader>
          <Tabs value={tipo} onValueChange={(v) => setTipo(v as TransactionType)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ingreso" className="data-[state=active]:text-green-600 data-[state=active]:bg-green-50 dark:data-[state=active]:bg-green-900/20">
                + Ingreso
              </TabsTrigger>
              <TabsTrigger value="gasto" className="data-[state=active]:text-red-600 data-[state=active]:bg-red-50 dark:data-[state=active]:bg-red-900/20">
                - Gasto
              </TabsTrigger>
              <TabsTrigger value="transferencia" className="data-[state=active]:text-blue-600 data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-900/20">
                ⇄ Transferencia
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Amount */}
            <div className="space-y-2">
              <Label>Monto</Label>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold ${tipoColors[tipo]}`}>
                  {tipo === "ingreso" ? "+" : tipo === "gasto" ? "-" : "⇄"}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className={`pl-8 text-xl font-bold h-14 ${tipoColors[tipo]}`}
                  {...register("monto")}
                />
              </div>
              {errors.monto && <p className="text-xs text-destructive">{errors.monto.message}</p>}
            </div>

            {/* Account */}
            <div className="space-y-2">
              <Label>Cuenta {tipo === "transferencia" && "de origen"}</Label>
              <Select
                value={watch("account_id")}
                onValueChange={(v) => setValue("account_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre} ({a.moneda})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.account_id && <p className="text-xs text-destructive">{errors.account_id.message}</p>}
            </div>

            {/* Destination account (transfers) */}
            {tipo === "transferencia" && (
              <div className="space-y-2">
                <Label>Cuenta de destino</Label>
                <Select
                  value={watch("to_account_id") ?? ""}
                  onValueChange={(v) => setValue("to_account_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná cuenta destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== watch("account_id"))
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.nombre} ({a.moneda})</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Category (not for transfers) */}
            {tipo !== "transferencia" && (
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select
                  value={watch("category_id") ?? ""}
                  onValueChange={(v) => setValue("category_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná categoría (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin categoría</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input
                    placeholder="O creá una nueva categoría..."
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateCategory(); } }}
                    className="text-sm"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleCreateCategory}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="space-y-2">
              <Label>Etiquetas</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Escribí una etiqueta..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
                  className="text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {selectedTagIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedTagIds.map((id) => {
                    const tag = allTags.find((t) => t.id === id);
                    return tag ? (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {tag.nombre}
                        <button type="button" onClick={() => setSelectedTagIds((p) => p.filter((tid) => tid !== id))}>
                          <X className="h-3 w-3 hover:text-destructive" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
              {allTags.filter((t) => !selectedTagIds.includes(t.id)).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {allTags.filter((t) => !selectedTagIds.includes(t.id)).map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => setSelectedTagIds((p) => [...p, tag.id])}
                      className="text-xs px-2 py-0.5 rounded-full border hover:bg-accent transition-colors"
                    >
                      + {tag.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" {...register("fecha")} />
              {errors.fecha && <p className="text-xs text-destructive">{errors.fecha.message}</p>}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notas <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Textarea placeholder="Descripción, referencia..." rows={3} {...register("notas")} />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className={`flex-1 ${
                  tipo === "ingreso" ? "bg-green-600 hover:bg-green-700" :
                  tipo === "gasto" ? "bg-red-600 hover:bg-red-700" : ""
                }`}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tipo === "ingreso" ? "Registrar Ingreso" : tipo === "gasto" ? "Registrar Gasto" : "Realizar Transferencia"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
