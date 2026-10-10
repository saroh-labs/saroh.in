"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { runAction } from "@/lib/api/run-action";
import { parseOptionValues } from "@/lib/products/option-values";
import { addOption, addOptionValue } from "@/lib/products/settings-actions";

/**
 * Add an option's values without leaving the product (UX-062): "Add size:
 * S, M, L". A business with no option yet gets one by that name. The
 * values are the business's, as Settings › Options keeps them, so a size is
 * still spelled one way everywhere; the page reads them again once added.
 */
export function OptionValuesInline({
    optionId,
    optName,
    existing,
    locked,
    onOption,
}: {
    /** The option the values join; null makes one called `optName`. */
    optionId: string | null;
    /** "Size". */
    optName: string;
    existing: readonly string[];
    locked: boolean;
    /** A new option was made: pick it. */
    onOption: (id: string) => void;
}) {
    const id = useId();
    const router = useRouter();
    const [typed, setTyped] = useState("");
    const [pending, start] = useTransition();
    const opt = optName.toLowerCase();
    const values = parseOptionValues(typed, existing);

    const add = () => {
        if (values.length === 0) return;
        start(async () => {
            if (!optionId) {
                const made = await runAction(() => addOption(optName, values));
                if (!made) return;
                if (!made.ok) {
                    showError(made.error);
                    return;
                }
                onOption(made.data.id);
            } else {
                for (const value of values) {
                    const res = await runAction(() =>
                        addOptionValue(optionId, value),
                    );
                    if (!res) return;
                    if (!res.ok) {
                        showError(`${value}: ${res.error}`);
                        return;
                    }
                }
            }
            setTyped("");
            showSuccess(
                `Added ${values.join(", ")}. Pick one below to make a variant.`,
            );
            router.refresh();
        });
    };

    return (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-border-strong p-3">
            <label htmlFor={id} className="text-[12px] font-medium">
                Add {opt} values
            </label>
            <Input
                dense
                id={id}
                value={typed}
                disabled={locked || pending}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        add();
                    }
                }}
                placeholder="S, M, L"
                className="min-w-0 flex-[1_1_160px]"
            />
            <Button
                size="sm"
                type="button"
                disabled={locked || values.length === 0}
                onClick={add}
                className="shrink-0"
                busy={pending}
                busyLabel="Adding…"
            >
                Add
            </Button>
            <span className="w-full text-[11.5px] text-muted-foreground">
                Separate them with commas. They join Settings › Options, so
                every product spells them the same way.
            </span>
        </div>
    );
}
