"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useId } from "react";

import type { EditorFields } from "@/components/editor-shell/editor-shell";
import {
    FIELD,
    LABEL,
    Section,
} from "@/components/services/service-editor/fields";
import { Chip } from "@/components/shared/chip";
import type { PlanForm } from "@/lib/subscriptions/plan-editor";
import { CLASS_CHOICES } from "@/lib/subscriptions/plan-editor";

import { FieldError } from "./details-section";
import { CHIP } from "./price-section";

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
            <p id={ids.note} className="text-[12.5px] text-muted-foreground">
                Each billing month. Unused classes don&apos;t carry over.
            </p>
            <div
                role="radiogroup"
                aria-label="Classes included"
                aria-describedby={ids.note}
                className="mt-2 flex flex-wrap gap-1.5"
            >
                {CLASS_CHOICES.map((n) => (
                    <Chip
                        key={n || "unlimited"}
                        on={!custom && values.classes === n}
                        className={CHIP}
                        onClick={() => {
                            onOther(false);
                            set({ classes: n });
                        }}
                    >
                        {n || "Unlimited"}
                    </Chip>
                ))}
                <Chip
                    on={custom}
                    className={CHIP}
                    onClick={() => onOther(true)}
                >
                    Other…
                </Chip>
            </div>
            {custom ? (
                <>
                    <label htmlFor={ids.n} className={cn(LABEL, "mt-2.5")}>
                        Classes a month
                    </label>
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
                        className={cn(FIELD, "w-[88px] max-w-full")}
                    />
                </>
            ) : null}
            <FieldError id={ids.err} message={errors.classes} />
        </Section>
    );
}
