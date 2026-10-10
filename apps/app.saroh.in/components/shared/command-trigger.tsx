"use client";

import { Button } from "@saroh/ui/button";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { SettingsSearch } from "@/components/settings/settings-search";
import {
    isApplePlatform,
    searchShortcut,
    searchShortcutSpoken,
} from "@/lib/nav/shortcut";
import type { SettingsActor } from "@/lib/settings/search";
import { isSettingsScreen } from "@/lib/settings/search";

import { Tip } from "@saroh/ui/tooltip";
import { openCommandMenu } from "./command-menu";

const BUTTON =
    "inline-flex size-8 items-center justify-center rounded-lg text-neutral-700 transition-colors duration-fast hover:bg-muted active:bg-accent-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background coarse:size-11 dark:text-foreground";

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
/** The keyboard never changes in a session: nothing to subscribe to. */
const subscribe = () => () => undefined;
const onApple = () => isApplePlatform(navigator);
// The server can't know: it says Ctrl, and a Mac corrects it on arrival.
const onServer = () => false;

export function CommandTrigger({ actor }: { actor: SettingsActor }) {
    // ⌘K on a Mac, Ctrl K on Windows and Linux: the hint names the key
    // this keyboard has.
    const apple = useSyncExternalStore(subscribe, onApple, onServer);
    if (isSettingsScreen(usePathname())) {
        return <SettingsSearch actor={actor} className={BUTTON} />;
    }
    return (
        <Tip label={`Search  ${searchShortcut(apple)}`}>
            <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                onClick={openCommandMenu}
                aria-label={`Search Saroh (${searchShortcutSpoken(apple)})`}
            >
                <Search className="size-4" />
            </Button>
        </Tip>
    );
}
