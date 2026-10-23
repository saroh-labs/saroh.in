"use client";

import type { ReactElement } from "react";
import { useState } from "react";

import { CheckRow } from "@/components/shared/fields/check-row";
import { FormSheet } from "@/components/shared/forms/form-sheet";
import type { DefaultsSuggestion } from "@/lib/products/settings";
import { suggestionText } from "@/lib/products/settings-rules";

const keyOf = (s: DefaultsSuggestion) => `${s.key}:${s.field}`;

/**
 * Every Defaults suggestion together, from the tab's one line ("6
 * categories usually warn lower than 10. Review"): each is ticked to begin
 * with, and Save makes the ticked ones those categories' own values, with
 * Undo. Nothing changes until Save.
 */
export function DefaultsReviewSheet({
    trigger,
    suggestions,
    names,
    onUse,
}: {
    trigger: ReactElement;
    suggestions: DefaultsSuggestion[];
    names: Partial<Record<string, string>>;
    /** Resolves true once saved. */
    onUse: (chosen: DefaultsSuggestion[]) => Promise<boolean>;
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [off, setOff] = useState<string[]>([]);
    const chosen = suggestions.filter((s) => !off.includes(keyOf(s)));

    return (
        <FormSheet
            trigger={trigger}
            open={open}
            onOpen={() => {
                setOff([]);
                setOpen(true);
            }}
            onClose={() => setOpen(false)}
            fieldsClassName="gap-2.5"
            title="Suggested defaults"
            description="Read from the products you already have. Ticked ones become each category's own value for new products."
            pending={busy}
            dirty
            saveLabel="Save"
            savingLabel="Saving…"
            onSubmit={(e) => {
                e.preventDefault();
                if (busy || chosen.length === 0) {
                    setOpen(false);
                    return;
                }
                setBusy(true);
                void onUse(chosen).then((ok) => {
                    setBusy(false);
                    if (ok) setOpen(false);
                });
            }}
        >
            {suggestions.map((s) => {
                const k = keyOf(s);
                const name = names[s.key] ?? "products";
                return (
                    <CheckRow
                        key={k}
                        checked={!off.includes(k)}
                        disabled={busy}
                        onChange={(on) =>
                            setOff((o) =>
                                on ? o.filter((x) => x !== k) : [...o, k],
                            )
                        }
                        className="gap-[9px] text-[13px]"
                    >
                        <span>
                            <span className="font-semibold">{name}</span>
                            <span className="text-foreground/75">
                                {" "}
                                · {suggestionText(s, name)}
                            </span>
                        </span>
                    </CheckRow>
                );
            })}
        </FormSheet>
    );
}
