"use client";

import { ChipGroup } from "@saroh/ui/choice-group";
import { Field, FieldError } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { useId } from "react";

import type { EditorFields } from "@/components/editor-shell/editor-shell";
import { Section } from "@/components/services/service-editor/fields";
import type { PlanForm } from "@/lib/subscriptions/plan-editor";
import { CLASS_CHOICES } from "@/lib/subscriptions/plan-editor";

const OTHER = "other";

/**
 * Classes included (D7): shown only where the business sells classes
 * (Appointments on, default 31). Unlimited, 4, 8 or 12, or Other… with a
 * count of its own. A change reaches each member from their next renewal
 * (D10), which the publish banner says.
 */
export function ClassesSection({
    fields,
    other,
    onOther,
}: {
    fields: EditorFields<PlanForm>;
    /** "Other…" is chosen: the count is typed. */
    other: boolean;
    onOther: (other: boolean) => void;
}) {
    const { values, set, errors } = fields;
    const ids = { note: useId(), n: useId(), err: useId() };
    const custom =
        other || !(CLASS_CHOICES as readonly string[]).includes(values.classes);
    return (
        <Section title="Classes included" className="[&>h2]:mb-1">
            <p
                data-ph-unmask=""
                id={ids.note}
                className="text-[12.5px] text-muted-foreground"
            >
                Each billing month. Unused classes don&apos;t carry over.
            </p>
            <ChipGroup
                label="Classes included"
                describedBy={ids.note}
                className="mt-2"
                value={custom ? OTHER : values.classes}
                onChange={(n) => {
                    if (n === OTHER) {
                        onOther(true);
                        return;
                    }
                    onOther(false);
                    set({ classes: n });
                }}
                choices={[
                    ...CLASS_CHOICES.map((n) => ({
                        value: n,
                        label: n || "Unlimited",
                    })),
                    { value: OTHER, label: "Other…" },
                ]}
            />
            {custom ? (
                <Field label="Classes a month" className="mt-2.5 space-y-[5px]">
                    <Input
                        id={ids.n}
                        inputMode="numeric"
                        autoComplete="off"
                        value={values.classes}
                        aria-invalid={Boolean(errors.classes)}
                        aria-describedby={errors.classes ? ids.err : undefined}
                        onChange={(e) =>
                            set({
                                classes: e.target.value.replace(/[^0-9]/g, ""),
                            })
                        }
                        className="w-[88px] max-w-full"
                    />
                </Field>
            ) : null}
            <FieldError id={ids.err}>{errors.classes}</FieldError>
        </Section>
    );
}
