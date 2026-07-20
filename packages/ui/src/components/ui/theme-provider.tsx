"use client";

import type { ThemeProviderProps } from "next-themes";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Canonical theme provider for the suite (thin wrapper over next-themes) so
 * every app themes the same way instead of maintaining its own copy.
 *
 * Suite theme strategy:
 *  - app.saroh.in / ui.saroh.in: use this provider (`attribute="class"`), so the
 *    `.dark` token set in @saroh/ui globals actually toggles.
 *  - saroh.in (marketing): forced dark.
 *  - accounts: intentionally a LIGHT card floating on a decorative dark
 *    backdrop — a deliberate design, not a theme (no provider needed).
 *  - docs/help: Nextra owns theming (`nextra-theme-docs`).
 *  - admin/sites/templates: minimal, light.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
