"use client";

import { useState, useTransition, useRef } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Power, PowerOff, Wallet, Search, Loader2, Star, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import { createAccount, updateAccount, deactivateAccount, activateAccount, getAccountsWithBalance, setDefaultAccount, clearDefaultAccount } from "@/app/actions/accounts";
import { toast } from "@/hooks/use-toast";
import { CURRENCIES, type Account, type AccountWithBalance } from "@/lib/types";

const accountSchema = z.object({
  nombre: z.string().min(2, "Mínimo 2 caracteres"),
  moneda: z.string().min(1, "Seleccioná una moneda"),
  saldo_inicial: z.coerce.number().refine((v) => !isNaN(v), { message: "Ingresá un número" }),
});
type AccountForm = z.infer<typeof accountSchema>;

interface AccountsClientProps {
  initialAccounts: AccountWithBalance[];
}

export function AccountsClient({ initialAccounts }: AccountsClientProps) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>(initialAccounts);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | "activo" | "inactivo">("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isPending, startTransition] = useTransition();
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [pendingIconUrl, setPendingIconUrl] = useState<string | null>(null);
  const iconFileRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: { moneda: "ARS", saldo_inicial: 0 },
  });

  const filtered = accounts.filter((a) => {
    const matchSearch = a.nombre.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" || a.estado === filterStatus;
    return matchSearch && matchStatus;
  });

  const openCreate = () => {
    setEditingAccount(null);
    setIconPreview(null);
    setPendingIconUrl(null);
    reset({ nombre: "", moneda: "ARS", saldo_inicial: 0 });
    setDialogOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditingAccount(account);
    setIconPreview(account.icon_url ?? null);
    setPendingIconUrl(account.icon_url ?? null);
    reset({ nombre: account.nombre, moneda: account.moneda, saldo_inicial: account.saldo_inicial });
    setDialogOpen(true);
  };

  const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) {
      toast({ variant: "destructive", title: "La imagen debe ser menor a 1 MB" });
      return;
    }
    setIconUploading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("account-icons").upload(path, file, {
        upsert: true, contentType: file.type,
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("account-icons").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setIconPreview(publicUrl);
      setPendingIconUrl(publicUrl);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error al subir ícono", description: err.message });
    } finally {
      setIconUploading(false);
      if (iconFileRef.current) iconFileRef.current.value = "";
    }
  };

  const onSubmit = (data: any) => {
    startTransition(async () => {
      try {
        if (editingAccount) {
          await updateAccount(editingAccount.id, { ...data, icon_url: pendingIconUrl });
          const refreshed = await getAccountsWithBalance();
          setAccounts(refreshed);
          toast({ title: "Cuenta actualizada" });
        } else {
          await createAccount({ ...data, icon_url: pendingIconUrl });
          const refreshed = await getAccountsWithBalance();
          setAccounts(refreshed);
          toast({ title: "Cuenta creada" });
        }
        setDialogOpen(false);
        setIconPreview(null);
        setPendingIconUrl(null);
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const toggleStatus = (account: Account) => {
    startTransition(async () => {
      try {
        const updated = account.estado === "activo"
          ? await deactivateAccount(account.id)
          : await activateAccount(account.id);
        const refreshed = await getAccountsWithBalance();
        setAccounts(refreshed);
        toast({ title: `Cuenta ${updated.estado === "activo" ? "activada" : "desactivada"}` });
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const toggleDefault = (account: AccountWithBalance) => {
    startTransition(async () => {
      try {
        if (account.is_default) {
          await clearDefaultAccount();
          toast({ title: "Cuenta predeterminada quitada" });
        } else {
          await setDefaultAccount(account.id);
          toast({ title: `"${account.nombre}" es ahora la cuenta predeterminada` });
        }
        const refreshed = await getAccountsWithBalance();
        setAccounts(refreshed);
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cuentas</h1>
          <p className="text-sm text-muted-foreground">{accounts.filter((a) => a.estado === "activo").length} cuentas activas</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nueva Cuenta
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="activo">Activas</SelectItem>
            <SelectItem value="inactivo">Inactivas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Account list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Wallet className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No hay cuentas</p>
            <p className="text-sm">Creá tu primera cuenta para empezar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((account) => (
            <Card key={account.id} className={account.estado === "inactivo" ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-primary/10 p-0.5 overflow-hidden h-10 w-10 flex items-center justify-center shrink-0">
                      {account.icon_url ? (
                        <Image
                          src={account.icon_url}
                          alt={account.nombre}
                          width={40}
                          height={40}
                          className="object-cover rounded-full h-10 w-10"
                        />
                      ) : (
                        <Wallet className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <CardTitle className="text-base">{account.nombre}</CardTitle>
                        {account.is_default && (
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{account.moneda}</p>
                    </div>
                  </div>
                  <Badge variant={account.estado === "activo" ? "success" : "secondary"}>
                    {account.estado}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${account.saldo_actual >= 0 ? "" : "text-red-600 dark:text-red-400"}`}>
                  {formatCurrency(account.saldo_actual, account.moneda)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Saldo actual</p>
                <p className="text-xs text-muted-foreground">
                  Inicial: {formatCurrency(account.saldo_inicial, account.moneda)}
                </p>
                <Separator className="my-3" />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(account)} className="flex-1">
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleDefault(account)}
                    disabled={isPending}
                    title={account.is_default ? "Quitar predeterminada" : "Marcar como predeterminada"}
                    className={account.is_default ? "text-amber-500 hover:text-amber-600 border-amber-300" : ""}
                  >
                    <Star className={`h-3.5 w-3.5 ${account.is_default ? "fill-amber-400" : ""}`} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleStatus(account)}
                    disabled={isPending}
                    className={account.estado === "activo"
                      ? "text-destructive hover:text-destructive"
                      : "text-green-600 hover:text-green-600"
                    }
                  >
                    {account.estado === "activo"
                      ? <><PowerOff className="h-3.5 w-3.5 mr-1" />Desactivar</>
                      : <><Power className="h-3.5 w-3.5 mr-1" />Activar</>
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Editar Cuenta" : "Nueva Cuenta"}</DialogTitle>
            <DialogDescription>
              {editingAccount ? "Modificá los datos de la cuenta." : "Completá los datos para crear una nueva cuenta."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Icon upload */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-border">
                  {iconPreview ? (
                    <Image src={iconPreview} alt="Ícono" width={64} height={64} className="object-cover h-full w-full rounded-full" />
                  ) : (
                    <Wallet className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => iconFileRef.current?.click()}
                  disabled={iconUploading}
                  className="absolute -bottom-1 -right-1 rounded-full bg-primary text-primary-foreground p-1 shadow-md hover:bg-primary/90 transition-colors"
                >
                  {iconUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                </button>
                <input
                  ref={iconFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={handleIconChange}
                />
              </div>
              <div>
                <p className="text-sm font-medium">Ícono de cuenta</p>
                <p className="text-xs text-muted-foreground">PNG, JPG o SVG, máx 1 MB</p>
                {iconPreview && (
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline mt-1"
                    onClick={() => { setIconPreview(null); setPendingIconUrl(null); }}
                  >
                    Quitar ícono
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" placeholder="Ej: Efectivo, Banco Nación..." {...register("nombre")} />
              {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Moneda</Label>
              <Select
                value={watch("moneda")}
                onValueChange={(v) => setValue("moneda", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.symbol} {c.name} ({c.code})
                    </SelectItem>
                  ))}
                  <SelectItem value="CUSTOM">Otra moneda...</SelectItem>
                </SelectContent>
              </Select>
              {watch("moneda") === "CUSTOM" && (
                <Input placeholder="Código de moneda (ej: CHF)" maxLength={5} {...register("moneda")} />
              )}
              {errors.moneda && <p className="text-xs text-destructive">{errors.moneda.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="saldo_inicial">Saldo Inicial</Label>
              <Input
                id="saldo_inicial"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register("saldo_inicial")}
              />
              {errors.saldo_inicial && <p className="text-xs text-destructive">{errors.saldo_inicial.message}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingAccount ? "Guardar Cambios" : "Crear Cuenta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
