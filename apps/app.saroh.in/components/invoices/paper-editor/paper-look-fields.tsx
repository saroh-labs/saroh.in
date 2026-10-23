"use client";

import type { PaperStyle } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState } from "react";

import {
    ChoiceGroup,
    RadioCards,
} from "@/components/shared/fields/choice-group";
import type { PaperDefault } from "@/lib/invoices/paper-look";
import {
    colourMoved,
    PAPER_SWATCHES,
    STYLE_CHOICES,
    swatchName,
    typedColour,
} from "@/lib/invoices/paper-look";

/**
 * Style and colour (DEC-173): Classic, Band or Compact, the board's
 * swatches, and any colour typed as `#RRGGBB`. Used by the paper's style
 * rail (U15) and by Settings › Business › Invoice style, the default.
 *
 * A colour is never refused for being pale or dark: the paper draws it
 * deeper where it has to, to read (`paperColours`), and this says so. A
 * colour typed wrong is said under the box and changes nothing.
 */
export function PaperLookFields({
    look,
    onStyle,
    onColour,
}: {
    look: PaperDefault;
    onStyle: (style: PaperStyle) => void;
    onColour: (hex: string) => void;
}) {
    const id = useId();
    const [typed, setTyped] = useState("");
    const [typedWrong, setTypedWrong] = useState(false);
    const colour = look.colour;
    const moved = colourMoved(look.style, colour);

    function applyTyped() {
        if (!typed.trim()) return;
        const hex = typedColour(typed);
        setTypedWrong(hex === null);
        if (hex) onColour(hex);
    }

    return (
        <>
            <div className="grid gap-2">
                <span id={`${id}-style`} className="label">
                    Style
                </span>
                <RadioCards<PaperStyle>
                    labelledBy={`${id}-style`}
                    value={look.style}
                    onChange={onStyle}
                    options={STYLE_CHOICES.map((s) => ({
                        value: s.value,
                        label: s.name,
                        note: s.hint,
                    }))}
                />
            </div>

            <div className="grid gap-2">
                <span id={`${id}-colour`} className="label">
                    Your colour
                </span>
                <ChoiceGroup
                    labelledBy={`${id}-colour`}
                    choices={PAPER_SWATCHES.map((hex) => ({
                        value: hex,
                        label: null,
                        ariaLabel: swatchName(hex),
                        tip: swatchName(hex),
                        // The swatch is the paper's own ink, as it prints.
                        style: { background: hex },
                    }))}
                    value={
                        PAPER_SWATCHES.find(
                            (s) => s === (colour ?? PAPER_SWATCHES[0]),
                        ) ?? null
                    }
                    onChange={onColour}
                    className="flex flex-wrap gap-2"
                    itemClassName={(on) =>
                        cn(
                            "size-[30px] rounded-full border-[3px] border-card ring-[1.5px] coarse:size-11",
                            on
                                ? "ring-foreground"
                                : "ring-border hover:ring-border-strong",
                        )
                    }
                />
                <div className="grid gap-1.5">
                    <Label htmlFor={`${id}-hex`} className="text-[12.5px]">
                        Or your own
                    </Label>
                    <div className="flex gap-2">
                        <Input
                            id={`${id}-hex`}
                            value={typed}
                            placeholder={
                                colour &&
                                !PAPER_SWATCHES.includes(colour as never)
                                    ? colour
                                    : "#6B3F1D"
                            }
                            maxLength={7}
                            autoCapitalize="characters"
                            className="font-mono"
                            aria-invalid={typedWrong || undefined}
                            aria-describedby={`${id}-hex-note`}
                            onChange={(e) => {
                                setTyped(e.target.value);
                                setTypedWrong(false);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    // Not the form's submit: the colour.
                                    e.preventDefault();
                                    applyTyped();
                                }
                            }}
                            onBlur={applyTyped}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={applyTyped}
                        >
                            Use it
                        </Button>
                    </div>
                    <p
                        id={`${id}-hex-note`}
                        className={cn(
                            "text-[12px]",
                            typedWrong
                                ? "text-destructive-subtle-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        {typedWrong
                            ? "A colour is # and six letters or digits, like #6B3F1D."
                            : moved
                              ? "Drawn a little deeper on the paper, so every word on it reads."
                              : "Any colour: the paper keeps its words readable."}
                    </p>
                </div>
            </div>
        </>
    );
}
