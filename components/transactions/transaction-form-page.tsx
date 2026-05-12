"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { NumericFormat } from "react-number-format";
import { ArrowLeft, Plus, X, Loader2, Search, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createTransaction } from "@/app/actions/transactions";
import { createCategory } from "@/app/actions/categories";
import { upsertTag } from "@/app/actions/tags";
import { toast } from "@/hooks/use-toast";
import { toISODateString } from "@/lib/utils";
import type { Account, Category, Tag, TransactionType } from "@/lib/types";

// monto is handled separately via NumericFormat + amountValue state
const schema = z.object({
  account_id: z.string().min(1, "Seleccioná una cuenta"),
  to_account_id: z.string().optional(),
  category_id: z.string().optional(),
  fecha: z.string().min(1, "Seleccioná una fecha"),
  notas: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  defaultTipo: TransactionType;
  defaultAccountId?: string | null;
}

export function TransactionFormPage({
  accounts,
  categories: initialCategories,
  tags: initialTags,
  defaultTipo,
  defaultAccountId,
}: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TransactionType>(defaultTipo);
  const [categories, setCategories] = useState(initialCategories);
  const [allTags, setAllTags] = useState(initialTags);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  // Category combobox state
  const [catSearch, setCatSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const catInputRef = useRef<HTMLInputElement>(null);

  // Amount raw value (float)
  const [amountValue, setAmountValue] = useState<number | undefined>(undefined);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the amount field after the DOM is ready
  useEffect(() => {
    const timer = setTimeout(() => {
      amountInputRef.current?.focus();
    }, 80);
    return () => clearTimeout(timer);
  }, []);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha: toISODateString(new Date()),
      account_id: defaultAccountId ?? accounts[0]?.id ?? "",
    },
  });

  const filteredCategories = categories.filter((c) =>
    c.estado === "activo" &&
    c.nombre.toLowerCase().includes(catSearch.toLowerCase())
  );
  const selectedCat = categories.find((c) => c.id === selectedCatId);
  const showCreateOption = catSearch.trim().length >= 2 && !filteredCategories.some(
    (c) => c.nombre.toLowerCase() === catSearch.trim().toLowerCase()
  );

  const filteredTags = allTags.filter(
    (t) =>
      t.estado === "activo" &&
      t.nombre.toLowerCase().includes(tagInput.toLowerCase()) &&
      !selectedTagIds.includes(t.id)
  );
  const showCreateTag = tagInput.trim().length >= 2 && !allTags.some(
    (t) => t.nombre.toLowerCase() === tagInput.trim().toLowerCase()
  );

  const handleSelectCategory = (id: string) => {
    setSelectedCatId(id);
    setValue("category_id", id);
    setCatSearch("");
    setCatOpen(false);
  };

  const handleCreateAndSelectCategory = async () => {
    const name = catSearch.trim();
    if (!name) return;
    try {
      const cat = await createCategory(name);
      setCategories((prev) => [...prev, cat]);
      handleSelectCategory(cat.id);
      toast({ title: `Categoría "${name}" creada` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const selectExistingTag = (tag: Tag) => {
    if (selectedTagIds.includes(tag.id)) return;
    setSelectedTagIds((prev) => [...prev, tag.id]);
    setTagInput("");
    setTagDropdownOpen(false);
    setTimeout(() => tagInputRef.current?.focus(), 0);
  };

  const handleAddTag = async (name?: string) => {
    const tagName = (name ?? tagInput).trim();
    if (!tagName) return;
    try {
      const tag = await upsertTag(tagName);
      if (!allTags.find((t) => t.id === tag.id)) setAllTags((prev) => [...prev, tag]);
      if (!selectedTagIds.includes(tag.id)) setSelectedTagIds((prev) => [...prev, tag.id]);
      setTagInput("");
      setTagDropdownOpen(false);
      setTimeout(() => tagInputRef.current?.focus(), 0);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  /** Build /transactions URL preserving any filters saved in localStorage. */
  function buildReturnUrl(): string {
    try {
      const stored = localStorage.getItem("monetara_tx_filters");
      if (!stored) return "/transactions";
      const f = JSON.parse(stored) as Record<string, string | undefined>;
      const params = new URLSearchParams();
      if (f.periodo && f.periodo !== "mes_actual") params.set("periodo", f.periodo);
      if (f.account_id)  params.set("account_id",  f.account_id);
      if (f.category_id) params.set("category_id", f.category_id);
      if (f.fechaDesde)  params.set("fechaDesde",  f.fechaDesde);
      if (f.fechaHasta)  params.set("fechaHasta",  f.fechaHasta);
      const qs = params.toString();
      return qs ? `/transactions?${qs}` : "/transactions";
    } catch {
      return "/transactions";
    }
  }

  const onSubmit = (data: any) => {
    if (!amountValue || amountValue <= 0) {
      toast({ variant: "destructive", title: "Ingresá un monto válido" });
      return;
    }
    startTransition(async () => {
      try {
        await createTransaction({
          monto: amountValue,
          tipo,
          account_id: data.account_id,
          category_id: tipo !== "transferencia" ? (selectedCatId || null) : null,
          fecha: data.fecha,
          notas: data.notas || null,
          to_account_id: tipo === "transferencia" ? (data.to_account_id || null) : null,
          tag_ids: selectedTagIds,
        });
        toast({
          title:
            tipo === "ingreso"
              ? "Ingreso registrado"
              : tipo === "gasto"
              ? "Gasto registrado"
              : "Transferencia registrada",
          variant: tipo === "ingreso" ? "success" : "default",
        });
        router.push(buildReturnUrl());
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const tipoColors = {
    ingreso: "text-green-600 dark:text-green-400",
    gasto: "text-red-600 dark:text-red-400",
    transferencia: "text-violet-600 dark:text-violet-400",
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
        <h1 className="text-2xl font-bold">Nuevo Movimiento</h1>
      </div>

      <Card>
        <CardHeader>
          <Tabs value={tipo} onValueChange={(v) => setTipo(v as TransactionType)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger
                value="ingreso"
                className="data-[state=active]:text-green-600 data-[state=active]:bg-green-50 dark:data-[state=active]:bg-green-900/20"
              >
                + Ingreso
              </TabsTrigger>
              <TabsTrigger
                value="gasto"
                className="data-[state=active]:text-red-600 data-[state=active]:bg-red-50 dark:data-[state=active]:bg-red-900/20"
              >
                - Gasto
              </TabsTrigger>
              <TabsTrigger
                value="transferencia"
                className="data-[state=active]:text-violet-600 data-[state=active]:bg-violet-50 dark:data-[state=active]:bg-violet-900/20"
              >
                ⇄ Transferencia
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Amount — NumericFormat with comma/dot support */}
            <div className="space-y-2">
              <Label>Monto</Label>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold ${tipoColors[tipo]}`}>
                  {tipo === "ingreso" ? "+" : tipo === "gasto" ? "-" : "⇄"}
                </span>
                <NumericFormat
                  customInput={Input}
                  thousandSeparator="."
                  decimalSeparator=","
                  decimalScale={2}
                  allowNegative={false}
                  placeholder="0,00"
                  getInputRef={amountInputRef}
                  className={`pl-8 text-xl font-bold h-14 ${tipoColors[tipo]}`}
                  onValueChange={(vals) => setAmountValue(vals.floatValue)}
                />
              </div>
              {amountValue !== undefined && amountValue <= 0 && (
                <p className="text-xs text-destructive">El monto debe ser mayor a 0</p>
              )}
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
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre} ({a.moneda})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.account_id && (
                <p className="text-xs text-destructive">{errors.account_id.message}</p>
              )}
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
                        <SelectItem key={a.id} value={a.id}>
                          {a.nombre} ({a.moneda})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Category — Combobox with search + create */}
            {tipo !== "transferencia" && (
              <div className="space-y-2">
                <Label>Categoría</Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCatOpen((o) => !o);
                      setTimeout(() => catInputRef.current?.focus(), 50);
                    }}
                    className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <span className={selectedCat ? "text-foreground" : "text-muted-foreground"}>
                      {selectedCat ? selectedCat.nombre : "Seleccioná o buscá una categoría"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                  </button>

                  {catOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                      <div className="flex items-center border-b px-3 py-2 gap-2">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <input
                          ref={catInputRef}
                          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                          placeholder="Buscar categoría..."
                          value={catSearch}
                          onChange={(e) => setCatSearch(e.target.value)}
                          onBlur={() => setTimeout(() => setCatOpen(false), 150)}
                        />
                        {catSearch && (
                          <button type="button" onClick={() => setCatSearch("")}>
                            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-52 overflow-y-auto py-1">
                        {selectedCatId && (
                          <button
                            type="button"
                            className="w-full text-left text-xs px-3 py-2 text-muted-foreground hover:bg-accent"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedCatId("");
                              setValue("category_id", "");
                              setCatOpen(false);
                            }}
                          >
                            Sin categoría
                          </button>
                        )}
                        {filteredCategories.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={`w-full text-left text-sm px-3 py-2 hover:bg-accent transition-colors ${
                              c.id === selectedCatId ? "bg-accent font-medium" : ""
                            }`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectCategory(c.id);
                            }}
                          >
                            {c.nombre}
                          </button>
                        ))}
                        {showCreateOption && (
                          <button
                            type="button"
                            className="w-full text-left text-sm px-3 py-2 hover:bg-accent text-primary flex items-center gap-2"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleCreateAndSelectCategory();
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Crear categoría "{catSearch.trim()}"
                          </button>
                        )}
                        {filteredCategories.length === 0 && !showCreateOption && (
                          <p className="text-xs text-muted-foreground px-3 py-2">Sin resultados</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tags — multi-select with search, no initial list */}
            <div className="space-y-2">
              <Label>
                Etiquetas{" "}
                <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
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
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
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

            {/* Date */}
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" {...register("fecha")} />
              {errors.fecha && <p className="text-xs text-destructive">{errors.fecha.message}</p>}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>
                Notas{" "}
                <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </Label>
              <Textarea
                placeholder="Descripción, referencia..."
                rows={2}
                {...register("notas")}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className={`flex-1 ${
                  tipo === "ingreso"
                    ? "bg-green-600 hover:bg-green-700"
                    : tipo === "gasto"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-violet-600 hover:bg-violet-700"
                } text-white`}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tipo === "ingreso"
                  ? "Registrar Ingreso"
                  : tipo === "gasto"
                  ? "Registrar Gasto"
                  : "Realizar Transferencia"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
