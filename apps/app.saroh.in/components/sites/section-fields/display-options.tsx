"use client";

import { Input } from "@saroh/ui/input";

import { ChoiceField, SHOW_HIDE } from "@/components/sites/choice-field";
import type { ListLayout } from "@/lib/sites/service";

import { Field } from "./field";

/** A switch that is on unless the merchant hid it. */
interface Shown {
    value: boolean;
    onChange: (next: boolean) => void;
    note?: string;
}

/**
 * How a list section shows its items (G16, R12), as the Site Editor design's
 * inspector draws a bound list: Show as, Photos, Descriptions, Prices,
 * Highlight and Button, in that order. Which items appear is not chosen here
 * — they come from the business, read live — so every option is about how
 * they look. A block offers only the options its items have (a plan has no
 * photo; a post has no price).
 *
 * The blocks store each option's default as ABSENT, so a section untouched
 * here publishes exactly as before; the field editors do that mapping.
 */
export function DisplayOptions({
    layout,
    onLayout,
    photos,
    descriptions,
    prices,
    highlight,
    button,
}: {
    layout: ListLayout;
    onLayout: (next: ListLayout) => void;
    photos?: Shown;
    descriptions?: Shown;
    prices?: Shown;
    highlight?: {
        value: "first" | "none";
        onChange: (next: "first" | "none") => void;
    };
    button?: {
        value: string;
        onChange: (next: string) => void;
        placeholder: string;
        note: string;
    };
}) {
    return (
        <div className="grid gap-3">
            <ChoiceField
                label="Show as"
                options={LAYOUTS}
                value={layout}
                onChange={onLayout}
                note="Cards sit side by side; a list is one per row with the photo on the left."
            />
            {photos ? (
                <ChoiceField
                    label="Photos"
                    options={SHOW_HIDE}
                    value={photos.value}
                    onChange={photos.onChange}
                    note={photos.note}
                />
            ) : null}
            {descriptions ? (
                <ChoiceField
                    label="Descriptions"
                    options={SHOW_HIDE}
                    value={descriptions.value}
                    onChange={descriptions.onChange}
                    note={descriptions.note}
                />
            ) : null}
            {prices ? (
                <ChoiceField
                    label="Prices"
                    options={SHOW_HIDE}
                    value={prices.value}
                    onChange={prices.onChange}
                    note={prices.note}
                />
            ) : null}
            {highlight ? (
                <ChoiceField
                    label="Highlight"
                    options={HIGHLIGHTS}
                    value={highlight.value}
                    onChange={highlight.onChange}
                    note="Marks the first plan “Most chosen”."
                />
            ) : null}
            {button ? (
                <>
                    <Field label="Button">
                        <Input
                            value={button.value}
                            maxLength={40}
                            onChange={(e) => button.onChange(e.target.value)}
                            placeholder={button.placeholder}
                        />
                    </Field>
                    <p className="-mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {button.note}
                    </p>
                </>
            ) : null}
        </div>
    );
}

const LAYOUTS = [
    ["cards", "Cards"],
    ["list", "List"],
] as const satisfies readonly (readonly [ListLayout, string])[];

const HIGHLIGHTS = [
    ["first", "First plan"],
    ["none", "None"],
] as const;

/**
 * An option stored as ABSENT when it is the block's default, so a section
 * the merchant set back to the default is the same JSON as one never touched.
 */
export function unlessDefault<V>(value: V, fallback: V): V | undefined {
    return value === fallback ? undefined : value;
}

/** A shown-unless-hidden switch as stored: on is absent, off is `false`. */
export function hiddenFlag(on: boolean): false | undefined {
    return on ? undefined : false;
}

/** Typed words as stored: empty (or only spaces) is absent. */
export function wordsOrAbsent(value: string): string | undefined {
    return value.trim() === "" ? undefined : value;
}
