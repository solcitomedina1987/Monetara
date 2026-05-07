"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight,
  Wallet, Tag, FolderOpen, BarChart3, X, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/accounts", label: "Cuentas", icon: Wallet },
  { href: "/categories", label: "Categorías", icon: FolderOpen },
  { href: "/tags", label: "Etiquetas", icon: Tag },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-card border-r">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-6 border-b">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg" onClick={onClose}>
          <TrendingUp className="h-6 w-6 text-primary" />
          <span>Finanzas</span>
        </Link>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="md:hidden">
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
                isActive
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
      <div className="p-4 border-t space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-3">
          Acciones Rápidas
        </p>
        <Link
          href="/transactions/new?tipo=ingreso"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
        >
          <ArrowUpCircle className="h-4 w-4" />
          + Ingreso
        </Link>
        <Link
          href="/transactions/new?tipo=gasto"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <ArrowDownCircle className="h-4 w-4" />
          - Gasto
        </Link>
        <Link
          href="/transactions/new?tipo=transferencia"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
          <ArrowLeftRight className="h-4 w-4" />
          ⇄ Transferencia
        </Link>
      </div>
    </div>
  );
}
