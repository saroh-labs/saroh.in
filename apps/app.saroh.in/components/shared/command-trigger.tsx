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
            aria-label="Search Saroh (Command K)"
            title="Search  ⌘K"
            className="inline-flex size-8 items-center justify-center rounded-lg text-neutral-700 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background coarse:size-11 dark:text-foreground"
        >
            <Search className="size-4" />
        </button>
    );
}
