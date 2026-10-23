"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";
import { useState } from "react";

import { ChoiceGroup } from "@/components/shared/fields/choice-group";
import type { StyleSwatch } from "@/lib/sites/style";
import { BrandPicker, PickerFoot, PickerHeader } from "./brand-picker";

/**
 * One line of the Brand tab's Colour (redesigned 22 Oct 2026): the row's
 * name, its colour and that colour's name, always written, so it reads on
 * touch as well as under a mouse. Pressing it opens what can go there
 * (`children`) as a popover. A phone's Brand sheet shows its colours as
 * chips instead (`PhoneColours`, DEC-185).
 */
export function ColourRow({
    label,
    title = label,
    note,
    chip,
    value,
    foot,
    after,
    className,
    children,
}: {
    /** The row's name: "Text". */
    label: string;
    /** The picker's name, when it isn't the row's. */
    title?: string;
    /** A quiet line beside the picker's name: "on Paper". */
    note?: string;
    /** The colour in force: one fill, or a colourway's chips. */
    chip: ReactNode;
    /** Its name: "Ink". */
    value: string;
    /** The picker's foot: a reason, a refusal; none draws no foot. */
    foot?: ReactNode;
    /** Under the row once the picker is shut (a refusal). */
    after?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <BrandPicker
                open={open}
                onOpenChange={setOpen}
                title={title}
                className={cn("w-[320px] max-w-[calc(100vw-24px)]", className)}
                header={
                    <PickerHeader
                        title={title}
                        note={note}
                        onClose={() => setOpen(false)}
                    />
                }
                trigger={
                    <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-expanded={open}
                        aria-label={`${label}: ${value}`}
                        data-colour-row={label}
                        className={cn(
                            "flex min-h-9 w-full items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-left text-[0.78125rem] transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            open && "border-foreground ring-1 ring-foreground",
                        )}
                    >
                        <span className="flex-1 text-muted-foreground">
                            {label}
                        </span>
                        {chip}
                        <span className="font-semibold">{value}</span>
                    </button>
                }
            >
                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
                {foot ? <PickerFoot>{foot}</PickerFoot> : null}
            </BrandPicker>
            {after && !open ? after : null}
        </>
    );
}

/** A colour drawn as a chip: the row's, or a swatch's in the picker. */
export function Chip({
    fill,
    className,
}: {
    fill: string | undefined;
    className?: string;
}) {
    return (
        <span
            aria-hidden
            className={cn(
                "size-[18px] shrink-0 rounded-[5px] border border-foreground/20",
                className,
            )}
            style={{ background: fill }}
        />
    );
}

/**
 * The row's five swatches, each with its name. One the page can't be
 * read in is faded and struck, never hidden: it still exists, it just
 * doesn't work with this page colour (`reason` says why in the foot).
 */
export function SwatchGrid({
    label,
    swatches,
    value,
    disabled,
    onChoose,
}: {
    label: string;
    swatches: StyleSwatch[];
    value: string | null;
    disabled: (swatch: StyleSwatch) => boolean;
    onChoose: (key: string) => void;
}) {
    return (
        <ChoiceGroup
            label={label}
            className="grid grid-cols-5 gap-1.5 p-3"
            value={value}
            onChange={onChoose}
            choices={swatches.map((swatch) => {
                const off = disabled(swatch);
                return {
                    value: swatch.key,
                    // The name is written under the colour, so it works on
                    // touch; the label carries it for a screen reader.
                    ariaLabel: swatch.label,
                    disabled: off,
                    label: (
                        <>
                            <span
                                aria-hidden
                                className={cn(
                                    "relative size-10 overflow-hidden rounded-[9px] border border-foreground/20",
                                    off &&
                                        "opacity-45 after:absolute after:left-1/2 after:top-[-20%] after:h-[140%] after:w-px after:rotate-45 after:bg-foreground",
                                )}
                                style={{ background: `hsl(${swatch.hsl})` }}
                            />
                            <span className={cn(off && "line-through")}>
                                {swatch.label}
                            </span>
                        </>
                    ),
                };
            })}
            itemClassName={(active, choice) =>
                cn(
                    "flex flex-col items-center gap-1.5 rounded-[9px] px-0.5 py-1.5 text-xs focus-visible:ring-offset-1 coarse:min-h-11",
                    active &&
                        "[&>span:first-child]:shadow-[0_0_0_2px_hsl(var(--background)),0_0_0_4px_hsl(var(--foreground))]",
                    choice.disabled
                        ? "cursor-default text-muted-foreground"
                        : "hover:bg-muted",
                )
            }
        />
    );
}

/**
 * Why a text colour can't be used on this page, in words (the contrast
 * lock): "Chalk: too light to read on Paper. Choose a darker page
 * background to use it."
 */
export function unreadableWords(
    swatch: StyleSwatch,
    ground: Pick<StyleSwatch, "label">,
): string {
    // A light colour on a light page, or a dark one on a dark page.
    const light = lightness(swatch.hsl) >= 50;
    return `${swatch.label}: too ${light ? "light" : "dark"} to read on ${ground.label}. Choose a ${light ? "darker" : "lighter"} page background to use it.`;
}

const lightness = (hsl: string) =>
    Number.parseFloat(hsl.trim().split(/\s+/)[2] ?? "50");
