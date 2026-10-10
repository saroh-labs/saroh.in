"use client";

import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import { useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import {
    checkoutLine,
    draftProblems,
    LATE_PRESETS,
    paidWay,
    thresholdScope,
    wayDraft,
    wayInput,
    waySaved,
    waySheetSays,
} from "@/lib/stores/delivery-summary";
import type { StorefrontFulfilmentType } from "@/lib/stores/fulfilment-types";
import { FULFILMENT_LABEL } from "@/lib/stores/late-after";
import type { StorefrontSettings } from "@/lib/stores/storefronts";

import { LateAfterField, MoneyField } from "./delivery-fields";
import type { Saver } from "./location-save";

const OTHER = "other";

const CHIP =
    "h-8 rounded-full border border-border bg-card px-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground active:bg-accent-active data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background coarse:h-11";

/**
 * One way's Edit sheet, opened from its row (owner, 10 Oct: a side sheet,
 * not a block under the row): whether it is offered; "What customers pay"
 * (Free or Charge, and the location's one free-over amount); "For your
 * team" (Mark late after: a preset or Other…); and what a customer will
 * see at checkout, as it is typed. The fields scroll; Save and Cancel stay
 * at the foot.
 *
 * Nothing saves until Save, which sends everything changed in one update
 * (`wayInput`, the same fields the page always saved). It is drawn in the
 * app's one sheet frame (`components/shared/form-sheet.tsx`),
 * which says how it closes: Cancel, Escape and the close button drop the
 * draft, and a press outside does nothing once something is changed. A
 * refusal keeps the sheet open with what was typed.
 *
 * The draft is this component's state: the row gives each opening its own
 * `key`, so it starts from what is saved every time.
 */
export function DeliveryWaySheet({
    store,
    type,
    open,
    pending,
    save,
    onClose,
}: {
    store: StorefrontSettings;
    type: StorefrontFulfilmentType;
    open: boolean;
    pending: boolean;
    save: Saver;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState(() => wayDraft(store, type));
    const [tried, setTried] = useState(false);
    const set = (patch: Partial<typeof draft>) =>
        setDraft((d) => ({ ...d, ...patch }));
    const label = FULFILMENT_LABEL[type];
    const id = `delivery-${type.toLowerCase()}`;
    const paid = paidWay(store, type);
    const problems = draftProblems(store, type, draft);
    const input = wayInput(store, type, draft);
    const changed = Object.keys(input).length > 0;
    const blocked = Object.keys(problems).length > 0;
    const checkout = checkoutLine(store, type, draft);
    // Said under a field once it has been typed in, or Save was pressed.
    const say = (key: keyof typeof problems) =>
        tried || key !== "fee" || draft.fee !== "" ? problems[key] : undefined;

    return (
        <FormSheet
            id={`${id}-panel`}
            // Back to the row's Edit, which opened it.
            returnFocusTo={() =>
                document.querySelector<HTMLElement>(`#${id} button`)
            }
            title={label}
            description={waySheetSays(store, type)}
            open={open}
            pending={pending}
            fieldsClassName="gap-5"
            // What the draft would send is the truest reading of a change.
            dirty={changed}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                setTried(true);
                if (blocked) return;
                if (!changed) {
                    onClose();
                    return;
                }
                save(
                    input,
                    waySaved(type, input),
                    undefined,
                    undefined,
                    onClose,
                );
            }}
        >
            <div className="flex items-center gap-3">
                <Switch
                    // First in the sheet: the keyboard starts
                    // here when it opens.
                    id={`${id}-on`}
                    checked={draft.on}
                    onCheckedChange={(on) => set({ on })}
                />
                <Label
                    htmlFor={`${id}-on`}
                    className="text-[13.5px] font-medium"
                >
                    Offer {label.toLowerCase()}
                </Label>
            </div>

            {draft.on && paid ? (
                <fieldset className="grid min-w-0 gap-2.5">
                    <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        What customers pay
                    </legend>
                    <div className="flex flex-wrap items-center gap-3">
                        <ToggleGroup
                            type="single"
                            value={draft.charge ? "charge" : "free"}
                            onValueChange={(v) => {
                                if (v) set({ charge: v === "charge" });
                            }}
                            aria-label={`What customers pay for ${label.toLowerCase()}`}
                            className={SEGMENTED}
                        >
                            <ToggleGroupItem value="free" className={SEGMENT}>
                                Free
                            </ToggleGroupItem>
                            <ToggleGroupItem value="charge" className={SEGMENT}>
                                Charge
                            </ToggleGroupItem>
                        </ToggleGroup>
                        {draft.charge ? (
                            <div className="w-32">
                                <Label
                                    htmlFor={`${id}-fee`}
                                    className="sr-only"
                                >
                                    {label} fee
                                </Label>
                                <MoneyField
                                    id={`${id}-fee`}
                                    value={draft.fee}
                                    placeholder="0"
                                    currency={store.currency}
                                    readOnly={false}
                                    invalid={Boolean(say("fee"))}
                                    describedBy={
                                        say("fee")
                                            ? `${id}-fee-problem`
                                            : undefined
                                    }
                                    onChange={(fee) => set({ fee })}
                                />
                            </div>
                        ) : null}
                    </div>
                    {say("fee") ? (
                        <p
                            id={`${id}-fee-problem`}
                            role="alert"
                            className="text-[12px] text-destructive"
                        >
                            {say("fee")}
                        </p>
                    ) : null}
                    {draft.charge ? (
                        <div className="grid gap-1.5">
                            <div className="flex flex-wrap items-center gap-3">
                                <Label
                                    htmlFor={`${id}-over`}
                                    className="text-[13px] font-medium"
                                >
                                    Free on orders over
                                </Label>
                                <div className="w-32">
                                    <MoneyField
                                        id={`${id}-over`}
                                        value={draft.threshold}
                                        placeholder="Never"
                                        currency={store.currency}
                                        readOnly={false}
                                        invalid={Boolean(problems.threshold)}
                                        describedBy={`${id}-over-note`}
                                        onChange={(threshold) =>
                                            set({ threshold })
                                        }
                                    />
                                </div>
                            </div>
                            <p
                                id={`${id}-over-note`}
                                role={problems.threshold ? "alert" : undefined}
                                className={
                                    problems.threshold
                                        ? "text-[12px] text-destructive"
                                        : "text-[12px] text-muted-foreground"
                                }
                            >
                                {problems.threshold ??
                                    `After any discount code. ${thresholdScope(type)} Empty: always charge.`}
                            </p>
                        </div>
                    ) : null}
                </fieldset>
            ) : null}

            {draft.on ? (
                <fieldset className="grid min-w-0 gap-2.5">
                    <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        For your team
                    </legend>
                    <p
                        id={`${id}-late-label`}
                        className="text-[13px] font-medium"
                    >
                        Mark late after
                    </p>
                    <ToggleGroup
                        type="single"
                        value={
                            draft.preset === null ? OTHER : String(draft.preset)
                        }
                        onValueChange={(v) => {
                            if (!v) return;
                            set({
                                preset: v === OTHER ? null : Number(v),
                            });
                        }}
                        aria-labelledby={`${id}-late-label`}
                        aria-describedby={`${id}-late-note`}
                        className="w-fit flex-wrap justify-start gap-1.5"
                    >
                        {LATE_PRESETS.map((p) => (
                            <ToggleGroupItem
                                key={p.minutes}
                                value={String(p.minutes)}
                                className={CHIP}
                            >
                                {p.label}
                            </ToggleGroupItem>
                        ))}
                        <ToggleGroupItem value={OTHER} className={CHIP}>
                            Other…
                        </ToggleGroupItem>
                    </ToggleGroup>
                    {draft.preset === null ? (
                        <div className="w-48">
                            <Label htmlFor={`${id}-late`} className="sr-only">
                                {label} late after
                            </Label>
                            <LateAfterField
                                id={`${id}-late`}
                                way={label}
                                amount={draft.amount}
                                unit={draft.unit}
                                readOnly={false}
                                invalid={Boolean(problems.late)}
                                describedBy={`${id}-late-note`}
                                onAmount={(amount) => set({ amount })}
                                onUnit={(unit) => set({ unit })}
                            />
                        </div>
                    ) : null}
                    <p
                        id={`${id}-late-note`}
                        role={problems.late ? "alert" : undefined}
                        className={
                            problems.late
                                ? "text-[12px] text-destructive"
                                : "text-[12px] text-muted-foreground"
                        }
                    >
                        {problems.late ??
                            "From when the order is placed. Shows as Late on Home and in Orders."}
                    </p>
                </fieldset>
            ) : null}

            {checkout ? (
                <p
                    aria-live="polite"
                    className="text-[13px] text-foreground/80"
                >
                    {checkout}
                </p>
            ) : null}
        </FormSheet>
    );
}
