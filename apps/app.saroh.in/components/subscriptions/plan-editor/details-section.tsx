"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useId } from "react";

import type { EditorFields } from "@/components/editor-shell/editor-shell";
import {
    FIELD,
    HELP,
    LABEL,
    Section,
} from "@/components/services/service-editor/fields";
import type { PlanForm } from "@/lib/subscriptions/plan-editor";

/** A refusal under its field, in the design's red line. */
export function FieldError({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return (
        <p
            id={id}
            role="alert"
            className="mt-[5px] text-[12.5px] text-destructive"
        >
            {message}
        </p>
    );
}

/**
 * Details (D7, after "Saroh Plan Editor"): the name, and the one line of
 * what's included that people read on the booking page and their receipt.
 */
export function DetailsSection({
    fields,
    withClasses,
}: {
    fields: EditorFields<PlanForm>;
    /** The business sells classes: the examples are a gym's, not a bakery's. */
    withClasses: boolean;
}) {
    const { values, set, errors } = fields;
    const ids = {
        name: useId(),
        nameErr: useId(),
        what: useId(),
        help: useId(),
    };
    return (
        <Section title="Details">
            <label htmlFor={ids.name} className={LABEL}>
                Name
            </label>
            <Input
                id={ids.name}
                value={values.name}
                maxLength={120}
                autoComplete="off"
                placeholder={
                    withClasses
                        ? "e.g. Monthly membership"
                        : "e.g. A loaf a week"
                }
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? ids.nameErr : undefined}
                onChange={(e) => set({ name: e.target.value })}
                className={FIELD}
            />
            <FieldError id={ids.nameErr} message={errors.name} />
            <label htmlFor={ids.what} className={cn(LABEL, "mt-3")}>
                What&apos;s included
            </label>
            <Input
                id={ids.what}
                value={values.description}
                maxLength={500}
                autoComplete="off"
                placeholder={
                    withClasses
                        ? "e.g. Gym floor and classes, any time"
                        : "e.g. One 800g sourdough, collect Saturdays"
                }
                aria-describedby={ids.help}
                onChange={(e) => set({ description: e.target.value })}
                className={FIELD}
            />
            <p id={ids.help} className={HELP}>
                One line — it&apos;s what people read on the booking page and
                their receipt.
            </p>
        </Section>
    );
}
