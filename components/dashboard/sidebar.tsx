"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight,
  Wallet, Tag, FolderOpen, BarChart3, X, UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

const navItems = [
  { href: "/dashboard",    label: "Dashboard",   icon: LayoutDashboard },
  { href: "/transactions", label: "Movimientos",  icon: ArrowLeftRight },
  { href: "/accounts",     label: "Cuentas",      icon: Wallet },
  { href: "/categories",   label: "Categorías",   icon: FolderOpen },
  { href: "/tags",         label: "Etiquetas",    icon: Tag },
  { href: "/reports",      label: "Reportes",     icon: BarChart3 },
  { href: "/perfil",       label: "Mi Perfil",    icon: UserCircle },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isMonetara = mounted && resolvedTheme === "monetara";

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r transition-colors",
        isMonetara ? "bg-[#0e415f] border-[#0e415f]" : "bg-card"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-16 items-center justify-between px-6",
          isMonetara ? "border-b border-white/20" : "border-b"
        )}
      >
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2 font-bold text-lg transition-opacity hover:opacity-80",
            isMonetara && "text-white"
          )}
          onClick={onClose}
        >
          <BrandLogo variant="icon" width={28} height={28} className="h-7 w-7 object-contain shrink-0" />
          <span className="truncate">Monetara</span>
        </Link>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={cn("md:hidden", isMonetara && "text-white hover:bg-white/10")}
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isMonetara
                  ? isActive
                    ? "bg-white text-[#0e415f]"
                    : "text-white/80 hover:bg-[#1f628e] hover:text-white"
                  : isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Quick actions */}
      <div
        className={cn(
          "p-4 border-t space-y-2",
          isMonetara ? "border-white/20" : ""
        )}
      >
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-wider px-1 mb-3",
            isMonetara ? "text-white/60" : "text-muted-foreground"
          )}
        >
          Acciones Rápidas
        </p>

        {/* Ingreso */}
        <Link
          href="/transactions/new?tipo=ingreso"
          onClick={onClose}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isMonetara
              ? "text-green-300 hover:bg-[#1f628e] hover:text-white"
              : "text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
          )}
        >
          <ArrowUpCircle className="h-4 w-4" />
          + Ingreso
        </Link>

        {/* Gasto */}
        <Link
          href="/transactions/new?tipo=gasto"
          onClick={onClose}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isMonetara
              ? "text-red-300 hover:bg-[#1f628e] hover:text-white"
              : "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          )}
        >
          <ArrowDownCircle className="h-4 w-4" />
          - Gasto
        </Link>

        {/* Transferencia — violet en todos los temas */}
        <Link
          href="/transactions/new?tipo=transferencia"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 transition-colors"
        >
          <ArrowLeftRight className="h-4 w-4" />
          ⇄ Transferencia
        </Link>
      </div>
    </div>
  );
}
