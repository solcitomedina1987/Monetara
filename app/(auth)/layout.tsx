import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel - branding (desktop only) */}
      <div className="hidden lg:flex flex-col justify-between bg-primary p-12 text-primary-foreground">
        <Link href="/login" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <div className="rounded-xl bg-white/15 p-1.5 backdrop-blur-sm">
            <BrandLogo variant="icon" width={32} height={32} className="h-8 w-8 object-contain" priority />
          </div>
          <span className="text-2xl font-bold tracking-tight">Monetara</span>
        </Link>

        <div className="space-y-4">
          <blockquote className="text-3xl font-semibold leading-tight">
            "Controlá tus finanzas personales de forma simple, visual y eficiente."
          </blockquote>
          <p className="text-primary-foreground/70">
            Registrá ingresos y egresos, gestioná cuentas y generá reportes detallados.
          </p>
        </div>

        <div className="text-sm text-primary-foreground/60">
          © {new Date().getFullYear()} Monetara App
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-col items-center justify-center p-8 bg-background">
        {/* Logo grande centrado — siempre visible arriba del formulario */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/login" className="transition-opacity hover:opacity-80">
            <BrandLogo
              variant="full"
              width={220}
              height={88}
              className="h-auto max-w-[200px] object-contain"
              priority
            />
          </Link>

          {/* Icono + texto "Monetara" — solo visible en sm+ (oculto en móvil) */}
          <Link
            href="/login"
            className="hidden md:flex items-center gap-1.5 mt-3 lg:hidden transition-opacity hover:opacity-80"
          >
            <BrandLogo variant="icon" width={20} height={20} className="h-5 w-5 object-contain" />
            <span className="text-base font-semibold text-foreground">Monetara</span>
          </Link>
        </div>

        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
