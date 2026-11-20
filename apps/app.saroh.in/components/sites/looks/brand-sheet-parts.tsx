"use client";

import { Button } from "@saroh/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { MoreHorizontal, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import type { LookId } from "@saroh/block-contract";
import { ChipGroup } from "@saroh/ui/choice-group";

import { lookName } from "./look-picker";

/*
 * The Brand tab's own pieces beside the panel (`style-panel.tsx`): Reset
 * style… and its ask, the "Saved." line, and the phone sheet's Colour tab
 * and head (DEC-185).
 */

/** How long "Saved." closes the loop before the line is its hint again. */
const SAVED_MS = 2000;

/** "Reset to Classic?": the ask before Reset to <look>. */
export function resetTitle(look: LookId | null | undefined): string {
    return `Reset to ${lookName(look)}?`;
}

/** What Reset to <look> brings back, said beside it and in the ask. */
export function resetBody(look: LookId | null | undefined): string {
    return `Brings back ${lookName(look)}’s own colours, fonts, buttons and shapes. Your pages and words stay. You can undo it.`;
}

/**
 * "Reset to <look>…" (U24b): it moves every colour, the fonts, the
 * buttons and shapes and any stored spacing at once, so it asks first,
 * keeping the style the safe way out; once done, Undo puts it all back in
 * one press (`useUndo`).
 */
export function ResetStyle({
    onReset,
    menu = false,
    look,
    wide = false,
}: {
    onReset: () => void;
    /** Behind ⋯ in a phone's Brand sheet: "Reset to <look>…" first. */
    menu?: boolean;
    /** The look it resets to; Classic when absent. */
    look?: LookId | null;
    /** The full-width button under "Changes to the look". */
    wide?: boolean;
}) {
    const label = `Reset to ${lookName(look)}`;
    const [open, setOpen] = useState(false);
    const [asking, setAsking] = useState(!menu);
    const titleId = useId();
    const bodyId = useId();
    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                setAsking(!menu);
            }}
        >
            <PopoverTrigger asChild>
                {menu ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="More: Reset style"
                        className="size-11 shrink-0 text-muted-foreground"
                    >
                        <MoreHorizontal aria-hidden />
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        size={wide ? "default" : "sm"}
                        aria-haspopup="dialog"
                        className={wide ? "w-full" : undefined}
                    >
                        <Undo2 aria-hidden />
                        {label}…
                    </Button>
                )}
            </PopoverTrigger>
            {asking ? (
                <PopoverContent
                    role="alertdialog"
                    aria-labelledby={titleId}
                    aria-describedby={bodyId}
                    side={menu ? "bottom" : "top"}
                    align="end"
                    className="w-[300px] max-w-[calc(100vw-24px)] rounded-xl p-3.5"
                >
                    <p id={titleId} className="text-sm font-semibold">
                        {resetTitle(look)}
                    </p>
                    <p
                        id={bodyId}
                        className="mb-3 mt-1.5 text-[0.78125rem] leading-normal text-muted-foreground"
                    >
                        {resetBody(look)}
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            autoFocus
                            onClick={() => setOpen(false)}
                        >
                            Keep my style
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                                setOpen(false);
                                onReset();
                            }}
                        >
                            {label}
                        </Button>
                    </div>
                </PopoverContent>
            ) : (
                <PopoverContent align="end" className="w-56 p-1">
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => setAsking(true)}
                    >
                        {label}…
                    </Button>
                </PopoverContent>
            )}
        </Popover>
    );
}

/** "Saved." for two seconds once a save lands, then the hint again. */
export function useSavedNow(saving: boolean, dirty: boolean): boolean {
    const [savedNow, setSavedNow] = useState(false);
    const wasSaving = useRef(saving);
    useEffect(() => {
        const landed = wasSaving.current && !saving && !dirty;
        wasSaving.current = saving;
        if (!landed) return;
        setSavedNow(true);
        const id = setTimeout(() => setSavedNow(false), SAVED_MS);
        return () => clearTimeout(id);
    }, [saving, dirty]);
    return savedNow;
}

/** One colour the Brand tab offers: a row on a desk, a chip on a phone. */
export interface ColourPart {
    key: string;
    label: string;
    note?: string;
    chip: ReactNode;
    value: string;
    foot?: ReactNode;
    after?: ReactNode;
    /** A line under the row: the hero that draws in the text colour. */
    hint?: string;
    content: ReactNode;
}

/**
 * The phone's Colour tab (DEC-185): a chip for each part, showing its
 * colour now; the chosen part's swatches below, and why a faded one
 * can't be used, in words.
 */
export function PhoneColours({ parts }: { parts: ColourPart[] }) {
    const [chosen, setChosen] = useState(parts[0]?.key ?? "");
    const part = parts.find((p) => p.key === chosen) ?? parts.at(0);
    if (!part) return null;
    return (
        <div className="space-y-2">
            <ChipGroup
                label="Colour"
                value={part.key}
                onChange={setChosen}
                choices={parts.map((p) => ({
                    value: p.key,
                    label: (
                        <span className="flex items-center gap-1.5">
                            {p.chip}
                            {p.label}
                        </span>
                    ),
                    ariaLabel: `${p.label}: ${p.value}`,
                }))}
            />
            {part.note ? (
                <p className="text-xs text-muted-foreground">
                    {part.label} {part.note}: {part.value}
                </p>
            ) : null}
            <div data-colour-part={part.key}>{part.content}</div>
            {part.foot ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                    {part.foot}
                </div>
            ) : null}
            {part.hint ? (
                <p data-hero-hint="" className="text-xs text-muted-foreground">
                    {part.hint}
                </p>
            ) : null}
        </div>
    );
}

/**
 * The phone Brand sheet's head (DEC-185): Saved, and ⋯ holding Reset
 * style…, which asks first and then offers Undo.
 */
export function BrandSheetActions({
    saving,
    dirty,
    onReset,
    look,
}: {
    saving: boolean;
    dirty: boolean;
    onReset: () => void;
    /** The look Reset goes back to; Classic when absent. */
    look?: LookId | null;
}) {
    const savedNow = useSavedNow(saving, dirty);
    return (
        <>
            <span
                className="shrink-0 px-1 text-xs text-muted-foreground"
                data-style-save-line=""
                role="status"
            >
                {saving ? "Saving…" : savedNow ? "Saved" : null}
            </span>
            <ResetStyle onReset={onReset} menu look={look} />
        </>
    );
}
