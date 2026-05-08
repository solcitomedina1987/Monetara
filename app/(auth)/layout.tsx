import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel - branding (desktop only) */}
      <div className="hidden lg:flex flex-col justify-between bg-primary p-12 text-primary-foreground">
        <Link href="/login" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <Image
            src="/logo-monetara-logo.png"
            alt="Logo Monetara"
            width={32}
            height={32}
            className="h-8 w-8 object-contain shrink-0"
            priority
          />
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
        {/* Logo grande centrado (visible siempre en mobile, oculto en desktop donde ya está el panel) */}
        <div className="flex flex-col items-center mb-8 lg:mb-6">
          {/* Logo completo grande */}
          <Link href="/login" className="transition-opacity hover:opacity-80">
            <Image
              src="/logo-monetara.png"
              alt="Logo Monetara"
              width={180}
              height={72}
              className="h-auto w-44 object-contain"
              priority
            />
          </Link>

          {/* Nombre de marca con icono — visible solo en mobile (el desktop tiene el panel izquierdo) */}
          <Link
            href="/login"
            className="flex items-center gap-1.5 mt-3 lg:hidden transition-opacity hover:opacity-80"
          >
            <Image
              src="/logo-monetara-logo.png"
              alt="Logo Monetara"
              width={20}
              height={20}
              className="h-5 w-5 object-contain"
            />
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
