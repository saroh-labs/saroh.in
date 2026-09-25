"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { SettingsSearch } from "@/components/settings/settings-search";
import type { SettingsActor } from "@/lib/settings/search";
import { isSettingsScreen } from "@/lib/settings/search";

import { openCommandMenu } from "./command-menu";

const BUTTON =
    "inline-flex size-8 items-center justify-center rounded-lg text-neutral-700 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background coarse:size-11 dark:text-foreground";

/**
 * Discoverable top-bar entry point for the ⌘K command palette.
 *
 * `min-h-11` (44px) below `md`, where this collapses to a bare icon: it measured
 * 42×30 on a phone, which clears WCAG 2.5.8 AA (24×24) and misses both the AAA
 * target and every native platform guideline. A search button on a phone is
 * pressed with a thumb, often one-handed, sometimes with the other hand full.
 * The design-system ring replaces the browser default, which is the P1 the audit
 * raised about hand-rolled controls bypassing `@saroh/ui`'s tokens.
 *
 * On the settings screen the same button is Search settings ("Saroh Settings"
 * design): someone there is looking for a setting, and the box that finds one
 * — "GSTIN", "invoice prefix" — opens on the tab that holds it. ⌘K still
 * opens the command menu everywhere, settings included, so nothing the
 * keyboard knew is lost.
 */
export function CommandTrigger({ actor }: { actor: SettingsActor }) {
    if (isSettingsScreen(usePathname())) {
        return <SettingsSearch actor={actor} className={BUTTON} />;
    }
    return (
        <button
            type="button"
            onClick={openCommandMenu}
            aria-label="Search Saroh (Command K)"
            title="Search  ⌘K"
            className={BUTTON}
        >
            <Search className="size-4" />
        </button>
    );
}
