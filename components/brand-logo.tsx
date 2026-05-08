"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface BrandLogoProps {
  /** "full" = logo-monetara.png (ancho), "icon" = logo-monetara-logo.png (cuadrado) */
  variant: "full" | "icon";
  /** Ancho en px para next/image (requerido). La altura se calcula por proporción. */
  width?: number;
  height?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
}

const LOGO_SRCS = {
  full: {
    light:    "/logo-monetara.png",
    dark:     "/logo-monetara-dark.png",
    monetara: "/logo-monetara.png",
  },
  icon: {
    light:    "/logo-monetara-logo.png",
    dark:     "/logo-monetara-logo-dark.png",
    monetara: "/logo-monetara-logo.png",
  },
} as const;

export function BrandLogo({
  variant,
  width = variant === "icon" ? 28 : 160,
  height = variant === "icon" ? 28 : 64,
  className = "",
  alt = "Logo Monetara",
  priority = false,
}: BrandLogoProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const themeKey = (resolvedTheme === "dark" ? "dark" : resolvedTheme === "monetara" ? "monetara" : "light") as keyof typeof LOGO_SRCS.full;
  const src = LOGO_SRCS[variant][themeKey];

  if (!mounted) {
    // Placeholder sin parpadeo durante hydration
    return (
      <div
        style={{ width, height }}
        className={`${className} bg-transparent`}
        aria-hidden
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
