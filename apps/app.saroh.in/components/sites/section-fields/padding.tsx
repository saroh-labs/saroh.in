"use client";

import { Label } from "@saroh/ui/label";

import type { Section } from "@/lib/sites/service";

import { FIELD_LABEL } from "./constants";

/**
 * A section's own padding, overriding the site setting (#189).
 *
 * Lives at the bottom of every section's field panel, as the design has it,
 * because it belongs to this section rather than to the site — the site-wide
 * value is in the Style panel, and putting both in one place would make it
 * unclear which one a merchant was changing.
 *
 * The default state is "Following the site setting", showing the value it is
 * following. That matters: a slider sitting at 52 with no other information
 * looks like a decision someone made about THIS section, when in fact nothing
 * has been decided and moving the site slider will still move it.
 */
export function SectionPadding({
    section,
    siteDefault,
    bounds,
    onChange,
}: {
    section: Section;
    siteDefault: number;
    bounds:
        { min: number; max: number; step: number; default: number } | undefined;
    onChange: (next: Section) => void;
}) {
    // Bounds come from the same served options as the site slider, so an
    // override can never reach a spacing the site setting could not.
    const min = bounds?.min ?? 24;
    const max = bounds?.max ?? 96;
    const step = bounds?.step ?? 1;

    const override = section.content.padding;
    const following = override === undefined;
    const shown = override ?? siteDefault;

    function set(padding: number | undefined) {
        // Deleting the key rather than storing null: the contract treats ABSENT
        // as "follow the site", and a null would have to be special-cased in
        // every reader.
        const content = { ...section.content } as Record<string, unknown>;
        if (padding === undefined) delete content.padding;
        else content.padding = padding;
        onChange({ ...section, content } as Section);
    }

    return (
        <div className="space-y-1 border-t pt-4">
            <Label htmlFor="section-padding" className={FIELD_LABEL}>
                Padding
            </Label>
            {/*
             * The state on its own line under the label, as the design has it:
             * "Following the site setting" is a sentence, and squeezing it
             * beside the label pushed the number that actually matters out to
             * the far edge.
             */}
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                    {following ? "Following the site setting" : "This section"}
                </span>
                <span className="text-xs tabular-nums">{shown}px</span>
            </div>
            <input
                id="section-padding"
                type="range"
                min={min}
                max={max}
                step={step}
                value={shown}
                onChange={(e) => set(Number(e.target.value))}
                className="w-full accent-foreground"
            />
            {!following && (
                <button
                    type="button"
                    onClick={() => set(undefined)}
                    className="rounded text-left text-xs text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Follow the site setting
                </button>
            )}
        </div>
    );
}
