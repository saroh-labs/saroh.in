"use client";

import { Search } from "lucide-react";

import { openCommandMenu } from "./command-menu";

/** Discoverable top-bar entry point for the ⌘K command palette. */
export function CommandTrigger() {
    return (
        <button
            type="button"
            onClick={openCommandMenu}
            aria-label="Search (Command K)"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
        >
            <Search className="h-4 w-4" />
            <span className="hidden md:inline">Search…</span>
            <kbd className="hidden rounded bg-muted px-1.5 py-0.5 text-xs font-medium md:inline">
                ⌘K
            </kbd>
        </button>
    );
}
