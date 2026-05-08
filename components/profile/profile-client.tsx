"use client";

import { useState, useTransition, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Camera, Loader2, User, Lock, Mail, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { updateProfile, updatePassword } from "@/app/actions/profile";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Profile } from "@/lib/types";

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

export function ProfileClient({ initialProfile }: { initialProfile: Profile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initialProfile.avatar_url ?? null
  );
  const [uploading, setUploading] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profilePending, startProfileTransition] = useTransition();
  const [pwdPending, startPwdTransition] = useTransition();

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

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: "destructive", title: "La imagen debe ser menor a 2 MB" });
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await updateProfile({ nombre: profile.nombre, apellido: profile.apellido, avatar_url: publicUrl });
      setAvatarPreview(publicUrl);
      setProfile((p) => ({ ...p, avatar_url: publicUrl }));
      toast({ title: "Foto de perfil actualizada" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error al subir imagen", description: err.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onProfileSubmit = (data: ProfileForm) => {
    startProfileTransition(async () => {
      try {
        const updated = await updateProfile({ ...data, avatar_url: profile.avatar_url ?? null });
        setProfile(updated);
        toast({ title: "Perfil actualizado" });
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mi Perfil</h1>
        <p className="text-sm text-muted-foreground">Gestioná tu información personal y seguridad.</p>
      </div>

      {/* Avatar + personal info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Información Personal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarPreview ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 rounded-full bg-primary text-primary-foreground p-1.5 shadow-md hover:bg-primary/90 transition-colors"
                title="Cambiar foto"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div>
              <p className="font-semibold">{profile.nombre} {profile.apellido}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Mail className="h-3.5 w-3.5" />
                {profile.email}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                JPG, PNG o WebP · máx. 2 MB
              </p>
            </div>
          </div>

          <Separator />

          {/* Profile form */}
          <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
