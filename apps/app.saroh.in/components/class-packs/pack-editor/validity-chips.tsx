"use client";

import { ChipGroup } from "@saroh/ui/choice-group";
import { Field, FieldError } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { useId, useRef, useState } from "react";

import { parseWhole, VALIDITY_CHIPS } from "@/lib/class-packs/pack-editor";

import { LABEL } from "./parts";

const OTHER = "other";

/**
 * "Use within" (E18): the design's day chips, then "Other…", which reveals
 * the one number field (the UX audit's fix: one control per value, not
 * chips and a field side by side). A value that isn't a chip opens with the
 * field showing. At least 7 days; less is marked here and keeps Publish off.
 */
export function ValidityChips({
    value,
    onChange,
    error,
}: {
    value: number | null;
    onChange: (days: number | null) => void;
    error?: string;
}) {
    const ids = { label: useId(), field: useId(), error: useId() };
    const offChip = !VALIDITY_CHIPS.some((d) => d === value);
    const [other, setOther] = useState(offChip);
    const fieldRef = useRef<HTMLInputElement>(null);
    const showField = other || offChip;

    return (
        <div className="mt-3.5">
            <div data-ph-unmask="" id={ids.label} className={LABEL}>
                Use within
            </div>
            <ChipGroup
                labelledBy={ids.label}
                describedBy={error && !showField ? ids.error : undefined}
                className="mt-1.5"
                value={showField ? OTHER : String(value)}
                onChange={(v) => {
                    if (v === OTHER) {
                        setOther(true);
                        // The field appears on this render; type into it next.
                        requestAnimationFrame(() => fieldRef.current?.focus());
                        return;
                    }
                    setOther(false);
                    onChange(Number(v));
                }}
                choices={[
                    ...VALIDITY_CHIPS.map((d) => ({
                        value: String(d),
                        label: `${d} days`,
                    })),
                    { value: OTHER, label: "Other…" },
                ]}
            />
            {showField ? (
                <Field label="Number of days" className="mt-2.5 space-y-[5px]">
                    <Input
                        ref={fieldRef}
                        id={ids.field}
                        inputMode="numeric"
                        autoComplete="off"
                        value={value === null ? "" : String(value)}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? ids.error : undefined}
                        onChange={(e) => onChange(parseWhole(e.target.value))}
                        className="w-[88px] max-w-full"
                    />
                </Field>
            ) : null}
            <FieldError id={ids.error}>{error}</FieldError>
        </div>
    );
}
