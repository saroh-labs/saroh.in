"use client";

import { Wordmark } from "@saroh/ui/wordmark";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";

const LINKS = [
    { href: "/modules", label: "Modules" },
    { href: "/#product", label: "Product" },
    { href: "/#how", label: "How it works" },
    { href: "/about", label: "About" },
];

/**
 * Sticky chrome. Hairline bottom border and a blurred ground — the whole nav is
 * one rule and some 13px labels, because in this register the chrome should be
 * the quietest thing on screen.
 */
export function SiteNav() {
    const { resolvedTheme, setTheme } = useTheme();

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl">
            <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
                <Link href="/" aria-label="Saroh — home" className="shrink-0">
                    <Wordmark style={{ fontSize: "1.0625rem" }} />
                </Link>

                <div className="flex items-center gap-1 sm:gap-5">
                    <div className="hidden items-center gap-5 sm:flex">
                        {LINKS.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {l.label}
                            </Link>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() =>
                            setTheme(
                                resolvedTheme === "dark" ? "light" : "dark",
                            )
                        }
                        aria-label="Toggle theme"
                        className="ml-1 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {/*
                          Both icons render; CSS picks one. `resolvedTheme` is
                          undefined during SSR, so choosing in JS needs a
                          mounted flag — which is a setState-in-effect, and
                          still leaves the icon missing on first paint. The
                          theme class is already on <html> before hydration, so
                          CSS resolves this in the same pass that paints
                          everything else. `resolvedTheme` is still read in the
                          click handler, where it is safe.
                        */}
                        <Moon className="size-4 dark:hidden" />
                        <Sun className="hidden size-4 dark:block" />
                    </button>

                    <Link
                        href="/#waitlist"
                        className="hidden h-8 items-center rounded-md border border-border px-3 text-[13px] font-medium transition-colors hover:bg-accent sm:inline-flex"
                    >
                        Waitlist
                    </Link>
                    <Link
                        href="https://accounts.saroh.in/signup"
                        className="inline-flex h-8 items-center rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                        Start free
                    </Link>
                </div>
            </nav>
        </header>
    );
}
