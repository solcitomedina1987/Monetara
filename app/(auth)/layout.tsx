import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel - branding (desktop only) */}
      <div className="hidden lg:flex flex-col justify-between bg-primary p-12 text-primary-foreground">
        <Link href="/login" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <div className="rounded-xl bg-white/15 p-2 backdrop-blur-sm">
            <Image
              src="/logo-monetara.png"
              alt="Monetara"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
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
        {/* Logo visible only on mobile */}
        <Link
          href="/login"
          className="flex flex-col items-center gap-2 mb-8 lg:hidden transition-opacity hover:opacity-80"
        >
          <Image
            src="/logo-monetara.png"
            alt="Monetara"
            width={64}
            height={64}
            className="h-16 w-16 object-contain"
            priority
          />
          <span className="text-xl font-bold tracking-tight">Monetara</span>
        </Link>

        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
