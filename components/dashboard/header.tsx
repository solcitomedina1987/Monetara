"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, Moon, Sun, LogOut, User, Palette, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

interface HeaderProps {
  profile: Profile | null;
  onMenuClick: () => void;
}

const THEMES = [
  { id: "light",    label: "Claro",    icon: Sun },
  { id: "dark",     label: "Oscuro",   icon: Moon },
  { id: "monetara", label: "Monetara", icon: Palette },
] as const;

export function Header({ profile: initialProfile, onMenuClick }: HeaderProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (data) setProfile(data as Profile);
    });
  }, []);

  const handleSignOut = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Clear persisted filters on logout
    try {
      localStorage.removeItem("monetara_tx_filters");
      localStorage.removeItem("monetara_dashboard_account");
      localStorage.removeItem("monetara_dashboard_periodo");
    } catch {}
    router.push("/login");
  };

  const initials = profile
    ? `${profile.nombre?.[0] ?? ""}${profile.apellido?.[0] ?? ""}`.toUpperCase()
    : "U";

  const currentThemeIcon = resolvedTheme === "dark"
    ? Moon
    : resolvedTheme === "monetara"
    ? Palette
    : Sun;
  const CurrentIcon = currentThemeIcon;

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 backdrop-blur px-4 md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1 md:flex-none" />

      <div className="flex items-center gap-2">
        {/* Theme selector dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Cambiar tema">
              <CurrentIcon className="h-5 w-5 transition-transform" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              Tema visual
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {THEMES.map(({ id, label, icon: Icon }) => (
              <DropdownMenuItem
                key={id}
                onClick={() => setTheme(id)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </div>
                {theme === id && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarImage src={profile?.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {profile ? `${profile.nombre} ${profile.apellido}` : "Usuario"}
                </p>
                <p className="text-xs leading-none text-muted-foreground">{profile?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/perfil")}>
              <User className="mr-2 h-4 w-4" />
              Mi Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              disabled={loading}
              className="text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {loading ? "Cerrando sesión..." : "Cerrar Sesión"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
