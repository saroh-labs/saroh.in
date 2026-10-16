"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import type { ReactElement } from "react";
import { useId, useState } from "react";

import { CheckRow } from "@/components/shared/check-row";
import { ChipGroup } from "@/components/shared/choice-group";
import { FormSheet } from "@/components/shared/form-sheet";
import type { DefaultsSuggestion } from "@/lib/products/settings";
import type { DefaultsRow, ReturnsChoice } from "@/lib/products/settings-rules";
import {
    lowProblem,
    RETURN_RULES,
    returnsLabel,
    suggestionText,
} from "@/lib/products/settings-rules";

import { PROBLEM } from "./product-settings";

/** The hint under every Low stock at, the All products card's too. */
export const LOW_HINT = "Needs you lists it when this many or fewer are left.";

/**
 * One category's own defaults, in a side sheet from its row (read first,
 * changed here, saved here with Undo). An empty field is the All products
 * value, said as the placeholder. A suggestion read from the category's own
 * products is offered beside its field. Every field's name carries the
 * category, so a screen reader hears "Poetry: low stock at".
 */
export function CategoryDefaultsSheet({
    trigger,
    row,
    all,
    suggestions,
    stillOnOld,
    onSave,
}: {
    trigger: ReactElement;
    row: DefaultsRow;
    all: DefaultsRow;
    suggestions: DefaultsSuggestion[];
    /** Saved products a change here could update, by what changes. */
    stillOnOld: (draft: DefaultsRow) => number;
    /** Resolves true once saved. */
    onSave: (draft: DefaultsRow, applyExisting: boolean) => Promise<boolean>;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [tried, setTried] = useState(false);
    const [draft, setDraft] = useState(row);
    const [applyExisting, setApplyExisting] = useState(false);
    const problem = tried ? lowProblem(draft) : "";
    const hit = stillOnOld(draft);
    const name = row.name;
    const set = (patch: Partial<DefaultsRow>) =>
        setDraft((d) => ({ ...d, ...patch }));
    const offer = (field: DefaultsSuggestion["field"]) =>
        suggestions.find(
            (s) =>
                s.field === field &&
                String(field === "howToUse" ? draft.howToUse : draft.low) !==
                    String(s.value),
        );
    const lowOffer = offer("lowStockAlert");
    const howOffer = offer("howToUse");

    const choices: { value: ReturnsChoice; label: string }[] = [
        {
            value: "",
            label: `Same as All products (${returnsLabel(all.returns)})`,
        },
        ...RETURN_RULES.map((r) => ({ value: r.choice, label: r.label })),
        ...(draft.returns.startsWith("OWN:") &&
        !RETURN_RULES.some((x) => x.choice === draft.returns)
            ? [{ value: draft.returns, label: returnsLabel(draft.returns) }]
            : []),
    ];

    return (
        <FormSheet
            trigger={trigger}
            open={open}
            onOpen={() => {
                setDraft(row);
                setTried(false);
                setApplyExisting(false);
                setOpen(true);
            }}
            onClose={() => setOpen(false)}
            fieldsClassName="gap-4"
            eyebrow="Defaults"
            title={name}
            description="What a new product in it starts with. Leave a field empty to use All products."
            pending={busy}
            dirty={JSON.stringify(draft) !== JSON.stringify(row)}
            saveLabel="Save"
            savingLabel="Saving…"
            onSubmit={(e) => {
                e.preventDefault();
                setTried(true);
                if (lowProblem(draft) || busy) return;
                setBusy(true);
                void onSave(draft, applyExisting && hit > 0).then((ok) => {
                    setBusy(false);
                    if (ok) setOpen(false);
                });
            }}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={`${id}-low`}>Low stock at</Label>
                <Input
                    id={`${id}-low`}
                    aria-label={`${name}: low stock at`}
                    aria-describedby={`${id}-low-note`}
                    aria-invalid={!!problem}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draft.low}
                    disabled={busy}
                    placeholder={
                        problem ? undefined : `${all.low}, from All products`
                    }
                    onChange={(e) => set({ low: e.target.value })}
                />
                <p
                    id={`${id}-low-note`}
                    role={problem ? "alert" : undefined}
                    className={
                        problem
                            ? PROBLEM
                            : "text-[12px] leading-[1.5] text-muted-foreground"
                    }
                >
                    {problem || LOW_HINT}
                </p>
                {lowOffer ? (
                    <Offer
                        text={suggestionText(lowOffer, name)}
                        onUse={() => set({ low: String(lowOffer.value) })}
                        label={`Use ${lowOffer.value} for ${name}`}
                    />
                ) : null}
            </div>

            <div className="grid gap-1.5">
                <Label htmlFor={`${id}-how`}>How to use or care for it</Label>
                <Input
                    id={`${id}-how`}
                    aria-label={`${name}: how to use or care for it`}
                    value={draft.howToUse}
                    disabled={busy}
                    placeholder={
                        all.howToUse
                            ? `${all.howToUse}, from All products`
                            : "Nothing. Each product says"
                    }
                    onChange={(e) => set({ howToUse: e.target.value })}
                />
                {howOffer ? (
                    <Offer
                        text={suggestionText(howOffer, name)}
                        onUse={() => set({ howToUse: String(howOffer.value) })}
                        label={`Use it for ${name}`}
                    />
                ) : null}
            </div>

            <div className="grid gap-1.5">
                <p className="text-sm font-medium">Returns</p>
                <ChipGroup
                    label={`${name}: returns`}
                    value={draft.returns}
                    onChange={(returns) => set({ returns })}
                    disabled={busy}
                    choices={choices}
                />
            </div>

            {hit > 0 ? (
                <CheckRow
                    checked={applyExisting}
                    onChange={setApplyExisting}
                    className="gap-[9px] text-[12.5px] text-foreground/75"
                >
                    Also update the {hit} saved{" "}
                    {hit === 1 ? "product" : "products"} still using the old
                    value. Products with their own value are left alone.
                </CheckRow>
            ) : null}
        </FormSheet>
    );
}

function Offer({
    text,
    label,
    onUse,
}: {
    text: string;
    label: string;
    onUse: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-muted px-[11px] py-2">
            <span className="flex-[1_1_200px] text-pretty text-[12.5px] leading-[1.45]">
                {text}
            </span>
            <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={label}
                onClick={onUse}
            >
                Use it
            </Button>
        </div>
    );
}
