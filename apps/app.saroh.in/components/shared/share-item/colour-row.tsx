"use client";

import { ChoiceGroup, Eyebrow, pillClass } from "@saroh/ui/choice-group";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Plus } from "lucide-react";
import { useId } from "react";

import { colourName } from "@/lib/share-item/share";
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
        <div className="flex min-w-0 flex-col gap-2" data-colour-row="">
            <Eyebrow id={`${id}-colours`}>
                {SHARE_WORDS.colours}
                <span className="font-normal normal-case tracking-normal">
                    {" "}
                    · {value ? colourName(value) : SHARE_WORDS.siteColours}
                </span>
            </Eyebrow>
            {/* One row, as the boards draw it. Below 360px Site colours takes
                its own line above the swatches, so nothing is cut or scrolled. */}
            <div className="-mx-1 flex min-w-0 items-center gap-2 px-1 py-1 coarse:gap-1.5 max-[359px]:items-end">
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
                            ariaLabel: colourName(hex),
                            tip: colourName(hex),
                            style: { background: hex },
                        })),
                    ]}
                    value={value ?? SITE}
                    onChange={(v) => onChange(v === SITE ? null : v)}
                    className="flex shrink-0 items-center gap-2 coarse:gap-1.5 max-[359px]:grid max-[359px]:grid-cols-[repeat(5,auto)]"
                    itemClassName={(on, choice) =>
                        choice.value === SITE
                            ? cn(
                                  pillClass(on),
                                  "max-[359px]:col-span-full max-[359px]:justify-self-start",
                              )
                            : cn(
                                  "size-9 rounded-full border-[3px] border-card ring-[1.5px] coarse:size-10",
                                  on
                                      ? "ring-foreground"
                                      : "ring-border hover:ring-border-strong",
                              )
                    }
                />
                <span className="relative shrink-0">
                    <Input
                        type="color"
                        aria-label={SHARE_WORDS.ownColour}
                        title={SHARE_WORDS.ownColour}
                        // Unpicked, a blank swatch with a plus: never a stray black.
                        value={value ?? "#ffffff"}
                        onChange={(e) => onChange(e.target.value.toLowerCase())}
                        className="size-9 cursor-pointer rounded-full border-0 p-0 ring-[1.5px] ring-border coarse:size-10 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                    />
                    {value ? null : (
                        <Plus
                            aria-hidden
                            className="pointer-events-none absolute inset-0 m-auto size-4 text-muted-foreground"
                        />
                    )}
                </span>
            </div>
        </div>
    );
}
