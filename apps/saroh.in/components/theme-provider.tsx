"use client";

import type { ThemeProviderProps } from "next-themes";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// Mirrors @saroh/ui/theme-provider, but kept local on purpose: the marketing
// site deliberately does NOT depend on @saroh/ui (it ships its own lean
// components/ui), so importing the shared wrapper would pull the whole UI
// package + its Radix graph into this build for a 3-line passthrough. saroh.in
// is forced-dark (see app/layout.tsx); the shared per-app theme strategy is
// documented in packages/ui/src/components/ui/theme-provider.tsx.
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
