"use client";

import { Button } from "@saroh/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { ChipGroup } from "@/components/shared/fields/choice-group";

/*
 * The Brand tab's own pieces beside the panel (`style-panel.tsx`): Reset
 * style… and its ask, the "Saved." line, and the phone sheet's Colour tab
 * and head (DEC-185).
 */

/** How long "Saved." closes the loop before the line is its hint again. */
const SAVED_MS = 2000;

export const RESET_TITLE = "Reset colours, typeface and spacing?";
export const RESET_BODY =
    "They go back to Classic’s own. Your look, pages and words stay. You can undo it.";

/**
 * "Reset style…" (22 Oct 2026): it moves every colour, the typeface and
 * the sliders at once, so it asks first, keeping the style the safe way
 * out; once done, Undo puts it all back in one press (`useUndo`).
 */
export function ResetStyle({
    onReset,
    menu = false,
}: {
    onReset: () => void;
    /** Behind ⋯ in a phone's Brand sheet: "Reset style…" first. */
    menu?: boolean;
}) {
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
                        size="sm"
                        aria-haspopup="dialog"
                    >
                        Reset style…
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
                        {RESET_TITLE}
                    </p>
                    <p
                        id={bodyId}
                        className="mb-3 mt-1.5 text-[0.78125rem] leading-normal text-muted-foreground"
                    >
                        {RESET_BODY}
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
                            Reset style
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
                        Reset style…
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
}: {
    saving: boolean;
    dirty: boolean;
    onReset: () => void;
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
            <ResetStyle onReset={onReset} menu />
        </>
    );
}
