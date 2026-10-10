"use client";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { useId } from "react";

import type { EditorFields } from "@/components/editor-shell/editor-shell";
import { HELP, Section } from "@/components/services/service-editor/fields";
import type { PlanForm } from "@/lib/subscriptions/plan-editor";

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
        what: useId(),
        help: useId(),
    };
    return (
        <Section title="Details">
            <Field label="Name" error={errors.name} className="space-y-[5px]">
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
                    onChange={(e) => set({ name: e.target.value })}
                />
            </Field>
            <Field label="What's included" className="mt-3 space-y-[5px]">
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
                />
            </Field>
            <p id={ids.help} className={HELP}>
                One line — it&apos;s what people read on the booking page and
                their receipt.
            </p>
        </Section>
    );
}
