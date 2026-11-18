"use client";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import type { ReactNode } from "react";

import { ChoiceField } from "./choice-field";

/** The board's two answers (DEC-227): absent is the same words. */
const PHONE_CHOICES = [
    [false, "Same on phone"],
    [true, "Shorter on phone"],
] as const satisfies readonly (readonly [boolean, string])[];

/** Said where body text may differ on a phone (SBPhoneText board). */
export const PHONE_SEARCH_HINT =
    "Search engines read this phone text. Keep the words people search for.";

/**
 * A text's phone version (KD9, DEC-227): "Same on phone" stores nothing,
 * "Shorter on phone" opens an empty phone field. Empty, the site shows the
 * desk words on a phone too, which the field says. Body text carries the
 * search hint; buttons may differ freely. The h1 never uses this.
 *
 * `children` replaces the plain one-line field (a Text block's body is
 * written in its own editor).
 */
export function PhoneTextField({
    label,
    value,
    fallback,
    onChange,
    searchHint = false,
    maxLength,
    children,
}: {
    /** The desk field's name: "Intro", "Main button". */
    label: string;
    value: string | undefined;
    /** The desk words, for "Empty: phone shows …". */
    fallback: string;
    onChange: (next: string | undefined) => void;
    searchHint?: boolean;
    maxLength?: number;
    children?: ReactNode;
}) {
    const shorter = value !== undefined;
    const empty = `Empty: phone shows “${fallback.trim()}”.`;
    return (
        <div className="grid gap-2">
            <ChoiceField
                label={`${label} on phone`}
                options={PHONE_CHOICES}
                value={shorter}
                onChange={(on) => onChange(on ? "" : undefined)}
                note={shorter && searchHint ? PHONE_SEARCH_HINT : undefined}
            />
            {shorter
                ? (children ?? (
                      <Field
                          label={`${label}, on phone`}
                          hint={fallback.trim() ? empty : undefined}
                      >
                          <Input
                              value={value}
                              onChange={(e) => onChange(e.target.value)}
                              maxLength={maxLength}
                          />
                      </Field>
                  ))
                : null}
        </div>
    );
}
