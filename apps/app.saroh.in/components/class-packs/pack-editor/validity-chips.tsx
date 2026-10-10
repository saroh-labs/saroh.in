"use client";

import { Field, FieldError } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { useId, useRef, useState } from "react";

import { parseWhole, VALIDITY_CHIPS } from "@/lib/class-packs/pack-editor";

import { LABEL, PackChip } from "./parts";

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
            <div id={ids.label} className={LABEL}>
                Use within
            </div>
            <div
                role="radiogroup"
                aria-labelledby={ids.label}
                aria-describedby={error && !showField ? ids.error : undefined}
                className="mt-1.5 flex flex-wrap gap-1.5"
            >
                {VALIDITY_CHIPS.map((d) => (
                    <PackChip
                        key={d}
                        on={!other && value === d}
                        onClick={() => {
                            setOther(false);
                            onChange(d);
                        }}
                    >
                        {d} days
                    </PackChip>
                ))}
                <PackChip
                    on={showField}
                    onClick={() => {
                        setOther(true);
                        // The field appears on this render; type into it next.
                        requestAnimationFrame(() => fieldRef.current?.focus());
                    }}
                >
                    Other…
                </PackChip>
            </div>
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
