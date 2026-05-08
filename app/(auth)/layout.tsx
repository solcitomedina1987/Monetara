import { TrendingUp } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel - branding */}
      <div className="hidden lg:flex flex-col justify-between bg-primary p-12 text-primary-foreground">
        <div className="flex items-center gap-2 text-2xl font-bold">
          <TrendingUp className="h-8 w-8" />
          <span>Monetara</span>
        </div>
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
        <div className="flex items-center gap-2 text-xl font-bold mb-8 lg:hidden">
          <TrendingUp className="h-6 w-6 text-primary" />
          <span>Monetara</span>
        </div>
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
