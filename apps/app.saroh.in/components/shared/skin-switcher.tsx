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
import { useState } from "react";

import type { SkinId } from "@/lib/skins";
import { DEFAULT_SKIN, isSkinId, SKIN_STORAGE_KEY, SKINS } from "@/lib/skins";

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
     * Initialised from the DOM, not from an effect. The pre-paint script has
     * already written `data-skin`, so reading it during the lazy initialiser
     * gets the right value on the first client render — an effect that calls
     * setState immediately would render once with the default and then again,
     * which the lint rule correctly flags as a cascading render.
     *
     * The `typeof document` guard is for the server pass, where the initialiser
     * also runs and there is no DOM.
     */
    const [skin, setSkin] = useState<SkinId>(() => {
        if (typeof document === "undefined") return DEFAULT_SKIN;
        const applied = document.documentElement.dataset.skin;
        return isSkinId(applied) ? applied : DEFAULT_SKIN;
    });

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
        setSkin(next);
    };

    const active = SKINS.find((s) => s.id === skin) ?? SKINS[0];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
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
