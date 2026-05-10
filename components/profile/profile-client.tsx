"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Camera, Loader2, User, Lock, Mail, Eye, EyeOff, Palette, Star, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfile, updatePassword } from "@/app/actions/profile";
import { setDefaultAccount, clearDefaultAccount } from "@/app/actions/accounts";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Profile, Account, ThemePreference } from "@/lib/types";
import { AvatarCropDialog } from "@/components/profile/avatar-crop-dialog";

const profileSchema = z.object({
  nombre: z.string().min(1, "Requerido"),
  apellido: z.string().min(1, "Requerido"),
});

const passwordSchema = z
  .object({
    newPassword: z.string().min(8, "Mínimo 8 caracteres"),
    confirmPassword: z.string().min(8, "Mínimo 8 caracteres"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export function ProfileClient({
  initialProfile,
  initialAccounts,
}: {
  initialProfile: Profile;
  initialAccounts: Account[];
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [profile, setProfile] = useState(initialProfile);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initialProfile.avatar_url ?? null
  );
  const [uploading, setUploading] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profilePending, startProfileTransition] = useTransition();
  const [pwdPending, startPwdTransition] = useTransition();
  const [themePending, startThemeTransition] = useTransition();
  const [defaultAccPending, startDefaultAccTransition] = useTransition();

  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const [themeDraft, setThemeDraft] = useState<ThemePreference>(
    (profile.default_theme as ThemePreference) ?? "light"
  );

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { nombre: profile.nombre, apellido: profile.apellido },
  });

  const {
    register: registerPwd,
    handleSubmit: handlePwdSubmit,
    reset: resetPwd,
    formState: { errors: pwdErrors },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const initials = `${profile.nombre[0] ?? ""}${profile.apellido[0] ?? ""}`.toUpperCase();

  const revokeCropSrc = useCallback(() => {
    if (cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
    }
  }, [cropImageSrc]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ variant: "destructive", title: "La imagen debe ser menor a 8 MB" });
      return;
    }
    revokeCropSrc();
    const url = URL.createObjectURL(file);
    setCropImageSrc(url);
    setCropOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadCroppedAvatar = async (blob: Blob) => {
    setUploading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const path = `${user.id}/avatar.png`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/png" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const updated = await updateProfile({ avatar_url: publicUrl });
      setAvatarPreview(publicUrl);
      setProfile(updated);
      revokeCropSrc();
      toast({ title: "Foto de perfil actualizada", variant: "success" });
      router.refresh();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error al subir imagen", description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const onProfileSubmit = (data: ProfileForm) => {
    startProfileTransition(async () => {
      try {
        const updated = await updateProfile({ ...data, avatar_url: profile.avatar_url ?? null });
        setProfile(updated);
        toast({ title: "Perfil actualizado", variant: "success" });
        router.refresh();
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const onSaveTheme = () => {
    startThemeTransition(async () => {
      try {
        const updated = await updateProfile({ default_theme: themeDraft });
        setProfile(updated);
        setTheme(themeDraft);
        toast({ title: "Tema guardado", description: "Se aplicará al iniciar sesión en otros dispositivos.", variant: "success" });
        router.refresh();
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const toggleDefaultAccount = (acc: Account) => {
    startDefaultAccTransition(async () => {
      try {
        if (acc.is_default) {
          await clearDefaultAccount();
          setAccounts((prev) => prev.map((a) => ({ ...a, is_default: false })));
          toast({ title: "Cuenta predeterminada quitada" });
        } else {
          await setDefaultAccount(acc.id);
          setAccounts((prev) =>
            prev.map((a) => ({ ...a, is_default: a.id === acc.id }))
          );
          toast({ title: `"${acc.nombre}" es ahora la predeterminada`, variant: "success" });
        }
        router.refresh();
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const onPasswordSubmit = (data: PasswordForm) => {
    startPwdTransition(async () => {
      try {
        await updatePassword(data.newPassword);
        resetPwd();
        toast({ title: "Contraseña actualizada exitosamente" });
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const activeAccounts = accounts.filter((a) => a.estado === "activo");

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-0">
      <div>
        <h1 className="text-2xl font-bold">Mi Perfil</h1>
        <p className="text-sm text-muted-foreground">Personalización y preferencias de Monetara.</p>
      </div>

      <AvatarCropDialog
        open={cropOpen}
        imageSrc={cropImageSrc}
        onOpenChange={(open) => {
          setCropOpen(open);
          if (!open) revokeCropSrc();
        }}
        onConfirm={uploadCroppedAvatar}
      />

      {/* Avatar + personal info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Información Personal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="relative shrink-0">
              <Avatar className="h-24 w-24 ring-2 ring-border">
                <AvatarImage src={avatarPreview ?? undefined} className="object-cover" />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 rounded-full bg-primary text-primary-foreground p-2 shadow-md hover:bg-primary/90 transition-colors"
                title="Cambiar foto"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFilePick}
              />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">
                {profile.nombre} {profile.apellido}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{profile.email}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Recortá y ajustá la foto antes de subir · JPG, PNG o WebP · máx. 8 MB
              </p>
            </div>
          </div>

          <Separator />

          <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input placeholder="Tu nombre" {...registerProfile("nombre")} />
                {profileErrors.nombre && (
                  <p className="text-xs text-destructive">{profileErrors.nombre.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Apellido</Label>
                <Input placeholder="Tu apellido" {...registerProfile("apellido")} />
                {profileErrors.apellido && (
                  <p className="text-xs text-destructive">{profileErrors.apellido.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profile.email} disabled className="bg-muted text-muted-foreground" />
              <p className="text-xs text-muted-foreground">El email no se puede modificar.</p>
            </div>

            <Button type="submit" disabled={profilePending}>
              {profilePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Preferencias — tema */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" /> Apariencia
          </CardTitle>
          <CardDescription>
            Tema por defecto al iniciar sesión (se sincroniza entre dispositivos).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <Label>Tema por defecto</Label>
            <Select
              value={themeDraft}
              onValueChange={(v) => setThemeDraft(v as ThemePreference)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Oscuro</SelectItem>
                <SelectItem value="monetara">Monetara</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={onSaveTheme} disabled={themePending}>
            {themePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar tema
          </Button>
        </CardContent>
      </Card>

      {/* Cuenta predeterminada */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-4 w-4" /> Cuenta predeterminada
          </CardTitle>
          <CardDescription>
            Se usa por defecto en el dashboard, filtros y al crear movimientos. Podés cambiarla también en{" "}
            <Link href="/accounts" className="text-primary underline underline-offset-2">
              Cuentas
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {activeAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tenés cuentas activas.</p>
          ) : (
            <ul className="space-y-2">
              {activeAccounts.map((acc) => (
                <li
                  key={acc.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
                >
                  <div className="rounded-full bg-muted h-10 w-10 shrink-0 overflow-hidden flex items-center justify-center">
                    {acc.icon_url ? (
                      <Image
                        src={acc.icon_url}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 object-cover"
                      />
                    ) : (
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{acc.nombre}</p>
                    <p className="text-xs text-muted-foreground">{acc.moneda}</p>
                  </div>
                  <Button
                    type="button"
                    variant={acc.is_default ? "secondary" : "ghost"}
                    size="icon"
                    className={`shrink-0 ${acc.is_default ? "text-amber-500" : ""}`}
                    disabled={defaultAccPending}
                    onClick={() => toggleDefaultAccount(acc)}
                    title={acc.is_default ? "Quitar predeterminada" : "Marcar como predeterminada"}
                  >
                    <Star className={`h-4 w-4 ${acc.is_default ? "fill-amber-400" : ""}`} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Password change */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Seguridad
          </CardTitle>
          <CardDescription>
            Cambiar contraseña. Usá una combinación de letras, números y símbolos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePwdSubmit(onPasswordSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nueva contraseña</Label>
              <div className="relative">
                <Input
                  type={showNewPwd ? "text" : "password"}
                  placeholder="Mínimo 8 caracteres"
                  className="pr-10"
                  {...registerPwd("newPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {pwdErrors.newPassword && (
                <p className="text-xs text-destructive">{pwdErrors.newPassword.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Confirmar nueva contraseña</Label>
              <div className="relative">
                <Input
                  type={showConfirmPwd ? "text" : "password"}
                  placeholder="Repetí la contraseña"
                  className="pr-10"
                  {...registerPwd("confirmPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {pwdErrors.confirmPassword && (
                <p className="text-xs text-destructive">{pwdErrors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" variant="outline" disabled={pwdPending}>
              {pwdPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Actualizar contraseña
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
