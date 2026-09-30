"use client";

import {
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import type { Control, FieldPath, FieldValues } from "react-hook-form";

import { KIND_CHOICES, kindOf } from "@/lib/organizations/kind";

import { SetupKindChoice } from "./setup-kind-choice";

/** "Just me", as setup offered it; anything unknown reads as a business. */
export function kindChoiceLabel(kind: unknown): string {
    const k = kindOf(kind);
    return KIND_CHOICES.find((c) => c.kind === k)?.label ?? "A business";
}

/** What the Identity card's first row says (DEC-070, K5). */
export const KIND_ROW_LABEL = "What this is";

/** Said under the choice: what a change does, and what it never does. */
export const KIND_NOTE =
    "Changes the words Saroh uses and what it suggests first. Nothing is turned on or off.";

/**
 * "What is this?" at the top of Settings › Business › Identity (DEC-070,
 * K5): the same three cards setup asked with, saved with the card like the
 * name. Only a role that may change settings reaches it, since the card's
 * fields show only while it is being edited.
 */
export function BusinessKindField<T extends FieldValues>({
    control,
    name,
    at,
}: {
    control: Control<T>;
    name: FieldPath<T>;
    at: (
        basis: string,
        grow?: boolean,
    ) => { className: string; style: React.CSSProperties };
}) {
    return (
        <FormField
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <FormItem {...at("100%")}>
                    <FormLabel id="business-kind-label">
                        What is this?
                    </FormLabel>
                    <SetupKindChoice
                        value={field.value}
                        onChange={field.onChange}
                        labelledBy="business-kind-label"
                        describedBy="business-kind-note"
                        invalid={Boolean(fieldState.error)}
                    />
                    <FormDescription id="business-kind-note">
                        {KIND_NOTE}
                    </FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
