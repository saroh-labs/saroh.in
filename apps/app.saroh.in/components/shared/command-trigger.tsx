"use client";

import { Search } from "lucide-react";

import { openCommandMenu } from "./command-menu";

/**
 * Discoverable top-bar entry point for the ⌘K command palette.
 *
 * `min-h-11` (44px) below `md`, where this collapses to a bare icon: it measured
 * 42×30 on a phone, which clears WCAG 2.5.8 AA (24×24) and misses both the AAA
 * target and every native platform guideline. A search button on a phone is
 * pressed with a thumb, often one-handed, sometimes with the other hand full.
 * The design-system ring replaces the browser default, which is the P1 the audit
 * raised about hand-rolled controls bypassing `@saroh/ui`'s tokens.
 */
export function CommandTrigger() {
    return (
        <button
            type="button"
            onClick={openCommandMenu}
            aria-label="Search (Command K)"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:min-h-0"
        >
            <Search className="h-4 w-4" />
            <span className="hidden md:inline">Search…</span>
            <kbd className="hidden rounded bg-muted px-1.5 py-0.5 text-xs font-medium md:inline">
                ⌘K
            </kbd>
        </button>
    );
}
