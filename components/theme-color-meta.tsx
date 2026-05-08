"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

const THEME_COLORS: Record<string, string> = {
  light:    "#ffffff",
  dark:     "#0b1221",
  monetara: "#f2f1ec",
  system:   "#ffffff",
};

export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = THEME_COLORS[resolvedTheme ?? "light"] ?? "#ffffff";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [resolvedTheme]);

  return null;
}
