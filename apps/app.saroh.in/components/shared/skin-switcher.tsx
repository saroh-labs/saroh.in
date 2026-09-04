"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { Check, Palette } from "lucide-react";
import { useSyncExternalStore } from "react";

import type { SkinId } from "@/lib/skins";
import {
    getSkinServerSnapshot,
    getSkinSnapshot,
    SKIN_STORAGE_KEY,
    SKINS,
    subscribeToSkin,
} from "@/lib/skins";

/**
 * Pick the workspace's visual world.
 *
 * Writes `data-skin` on <html>, which is the same element `next-themes` puts
 * `class="dark"` on, so the two axes compose: skin decides the palette, mode
 * decides the register. Nothing re-renders — the browser recomputes custom
 * properties and every component follows, because they all read tokens.
 *
 * Read back from the DOM rather than from state on mount: the pre-paint script
 * in the root layout has already applied the stored choice, and trusting that
 * avoids a flash of the default skin before hydration catches up.
 */
export function SkinSwitcher() {
    /*
     * Subscribed to `<html data-skin>` rather than initialised from it.
     *
     * This used to be `useState(() => readTheDOM())`, and it was wrong in a way
     * that hid itself. The server has no localStorage, so it renders the
     * default; the pre-paint script then applies the STORED skin before React
     * hydrates. A lazy initialiser cannot reconcile those two — React keeps the
     * server's attribute and the label stays frozen at its guess. The previous
     * code knew a mismatch existed and reached for `suppressHydrationWarning`,
     * which silences the warning without changing the value: the workspace
     * painted Panel while the control that sets it said Mono, and the console
     * was clean because the evidence had been suppressed.
     *
     * `useSyncExternalStore` is the fix rather than a patch. It renders the
     * server snapshot during hydration — so the markup genuinely matches — and
     * swaps to the live one immediately after, which is the same thing the
     * editor does for its panel widths and for the same reason.
     *
     * It also removes the second source of truth: there is no local state to
     * keep in step, because the attribute IS the state.
     */
    const skin = useSyncExternalStore(
        subscribeToSkin,
        getSkinSnapshot,
        getSkinServerSnapshot,
    );

    const choose = (next: SkinId) => {
        // `setAttribute` rather than assigning to `dataset`: the lint rule
        // treats the DOMStringMap as read-only, and this says the same thing
        // without arguing with it.
        document.documentElement.setAttribute("data-skin", next);
        try {
            window.localStorage.setItem(SKIN_STORAGE_KEY, next);
        } catch {
            // Private mode or blocked storage: the choice still applies for
            // this session, it just will not survive a reload. Losing a theme
            // preference is not worth failing the interaction over.
        }
        // No setState: the MutationObserver behind `subscribeToSkin` sees the
        // attribute change and re-renders every reader, so the trigger's label
        // and the menu's tick cannot disagree with what is painted.
    };

    const active = SKINS.find((s) => s.id === skin) ?? SKINS[0];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    /*
                     * No `suppressHydrationWarning` here any more, and its
                     * absence is the point: with the store above there is no
                     * mismatch left to suppress. The server renders the default
                     * and so does the hydration pass; the real skin arrives on
                     * the commit straight after. Suppressing the warning was
                     * what let this ship saying the wrong skin out loud to
                     * screen readers.
                     */
                    aria-label={`Theme: ${active.name}. Change theme`}
                >
                    <Palette className="size-5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Workspace theme</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SKINS.map((option) => {
                    const selected = option.id === skin;
                    return (
                        <DropdownMenuItem
                            key={option.id}
                            onSelect={() => choose(option.id)}
                            // Press feedback: choosing a skin commits — it
                            // writes `data-skin` and persists it — so unlike a
                            // link this row deserves the acknowledgement.
                            className="wk-press items-start gap-3 py-2.5"
                        >
                            {/*
                             * Swatches, not a colour name. "Panel" tells you
                             * nothing; five chips tell you what you are about
                             * to look at.
                             */}
                            <span
                                aria-hidden
                                className="mt-0.5 flex shrink-0 overflow-hidden rounded-sm border border-border"
                            >
                                {option.swatch.map((hex) => (
                                    <span
                                        key={hex}
                                        style={{ background: hex }}
                                        className="size-3.5"
                                    />
                                ))}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                    <span className="text-sm font-medium">
                                        {option.name}
                                    </span>
                                    {selected ? (
                                        <Check className="size-3.5 text-brand" />
                                    ) : null}
                                </span>
                                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                                    {option.blurb}
                                </span>
                            </span>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
