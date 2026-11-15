"use client";

import { ChoiceGroup, Eyebrow, pillClass } from "@saroh/ui/choice-group";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useId } from "react";

import { SHARE_WORDS } from "@/lib/share-item/words";

const SITE = "site";

/**
 * The cards' colours (owner, 12 Nov 2026): "Site colours" (the default),
 * swatches from the site's own look, and a colour of one's own. A card
 * drawn on a picked colour takes white or black text, whichever reads.
 * `value` is `#rrggbb`, or null for the site's colours.
 */
export function ColourRow({
    swatches,
    value,
    onChange,
}: {
    swatches: readonly string[];
    value: string | null;
    onChange: (value: string | null) => void;
}) {
    const id = useId();
    // A colour picked with the input shows as a swatch of its own.
    const shown =
        value && !swatches.includes(value) ? [...swatches, value] : swatches;
    return (
        <div className="flex flex-col gap-2" data-colour-row="">
            <Eyebrow id={`${id}-colours`}>{SHARE_WORDS.colours}</Eyebrow>
            <div className="flex flex-wrap items-center gap-2">
                <ChoiceGroup
                    labelledBy={`${id}-colours`}
                    choices={[
                        {
                            value: SITE,
                            label: SHARE_WORDS.siteColours,
                        },
                        ...shown.map((hex) => ({
                            value: hex,
                            label: null,
                            ariaLabel: `Colour ${hex}`,
                            style: { background: hex },
                        })),
                    ]}
                    value={value ?? SITE}
                    onChange={(v) => onChange(v === SITE ? null : v)}
                    className="flex flex-wrap items-center gap-2"
                    itemClassName={(on, choice) =>
                        choice.value === SITE
                            ? pillClass(on)
                            : cn(
                                  "size-7 rounded-full border-[3px] border-card ring-[1.5px] coarse:size-10",
                                  on
                                      ? "ring-foreground"
                                      : "ring-border hover:ring-border-strong",
                              )
                    }
                />
                <Input
                    type="color"
                    aria-label={SHARE_WORDS.ownColour}
                    title={SHARE_WORDS.ownColour}
                    value={value ?? "#000000"}
                    onChange={(e) => onChange(e.target.value.toLowerCase())}
                    className="size-7 cursor-pointer rounded-full border-0 p-0 ring-[1.5px] ring-border coarse:size-10 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                />
            </div>
        </div>
    );
}
