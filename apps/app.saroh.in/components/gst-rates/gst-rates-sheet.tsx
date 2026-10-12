"use client";

import { Field, focusFirstError } from "@saroh/ui/field";
import { Notice } from "@saroh/ui/notice";
import { OptionSelect } from "@saroh/ui/option-select";
import type { FormEvent } from "react";
import { useState } from "react";

import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
    useFormSheetDirty,
} from "@/components/shared/form-sheet";
import { Refusal } from "@/components/shared/refusal";
import { WHO_CAN_CHANGE } from "@/lib/access/who-can-change";
import { runAction } from "@/lib/api/run-action";
import { formatMoney } from "@/lib/format/money";
import type { ChosenRate, RateChoices, RateRow } from "@/lib/gst-rates/missing";
import {
    chosenRates,
    kindWord,
    rateKey,
    rowName,
    unchosen,
} from "@/lib/gst-rates/missing";
import type { GstRateValue } from "@/lib/invoices/gst";
import {
    GST_RATE_CHOICES,
    GST_RATE_NEEDED,
    GST_RATE_PLACEHOLDER,
} from "@/lib/invoices/gst";

/** How a save went: nothing more to say, or why it didn't go through. */
export type RatesSaved = { ok: true } | { ok: false; error: string };

/**
 * The sheet a GST rate is chosen in (12 Oct 2026): one row per thing with
 * no rate, each with the rates GST has. It is drawn two ways.
 *
 * - **The ask** (`requireAll`): a payment or an invoice was refused for
 *   these items. Every row must be answered, and Save carries on with what
 *   was started ("Save and take payment").
 * - **The list**: everything on sale with no rate, from the notice on
 *   Services and Invoices. Save keeps whichever were chosen.
 *
 * 0% is a row in the list of rates like any other. The box starts on its
 * placeholder, which is the only way "not chosen" is drawn.
 */
export function GstRatesSheet({
    rows,
    title,
    description,
    saveLabel,
    requireAll,
    note,
    save,
    onDone,
}: {
    /** What has no rate; the sheet is open while there is a list. */
    rows: readonly RateRow[] | null;
    title: string;
    description: string;
    saveLabel: string;
    /** Every row has to be answered before Save goes on. */
    requireAll: boolean;
    /** A line under the rows: where the choice is kept. */
    note?: string;
    save: (chosen: ChosenRate[]) => Promise<RatesSaved>;
    /** How many were saved, or null when closed without saving. */
    onDone: (saved: number | null) => void;
}) {
    return (
        <FormSheet
            open={rows !== null}
            title={title}
            description={description}
            onClose={() => onDone(null)}
        >
            {rows ? (
                <RatesDraft
                    // A fresh draft for each list asked about.
                    key={rows.map(rateKey).join("|")}
                    rows={rows}
                    saveLabel={saveLabel}
                    requireAll={requireAll}
                    note={note}
                    save={save}
                    onDone={onDone}
                />
            ) : null}
        </FormSheet>
    );
}

function RatesDraft({
    rows,
    saveLabel,
    requireAll,
    note,
    save,
    onDone,
}: {
    rows: readonly RateRow[];
    saveLabel: string;
    requireAll: boolean;
    note?: string;
    save: (chosen: ChosenRate[]) => Promise<RatesSaved>;
    onDone: (saved: number | null) => void;
}) {
    const [choices, setChoices] = useState<RateChoices>({});
    // The one rate last given to every row; "" once a row is changed after.
    const [forAll, setForAll] = useState<GstRateValue>("");
    const [saving, setSaving] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    // What is still to choose is said once Save is pressed.
    const [tried, setTried] = useState(false);

    const chosen = chosenRates(rows, choices);
    const left = unchosen(rows, choices);
    const locked = rows.filter((row) => row.canSet === false);
    const open = rows.filter((row) => row.canSet !== false);
    useFormSheetDirty(chosen.length > 0);

    async function submit(event: FormEvent<HTMLFormElement>) {
        const form = event.currentTarget;
        if (saving) return;
        setRefusal(null);
        if (requireAll && left.length > 0) {
            setTried(true);
            // Once the rows are marked, the keyboard goes to the first one.
            focusFirstError(form);
            return;
        }
        // The list, with nothing chosen: there is nothing to save.
        if (chosen.length === 0) return onDone(null);
        const res = await runAction(() => save(chosen), {
            setBusy: setSaving,
            quiet: true,
            onUnreached: setRefusal,
        });
        if (!res) return;
        if (!res.ok) return setRefusal(res.error);
        onDone(chosen.length);
    }

    return (
        <>
            <FormSheetBody className="grid content-start gap-4">
                {locked.length > 0 ? (
                    <Notice tone="neutral">
                        {locked.length === rows.length
                            ? "Your role can't set these."
                            : "Your role can't set some of these."}{" "}
                        {WHO_CAN_CHANGE}
                    </Notice>
                ) : null}
                {/* Most businesses charge one rate on everything: with
                    several rows, one choice fills them all, and any row can
                    still be changed after (owner, 12 Oct 2026). */}
                {open.length > 1 ? (
                    <div className="grid gap-4 border-b border-border pb-4">
                        <Field
                            label={`One rate for all ${open.length}`}
                            hint="Fills every row below. Change any that differ."
                        >
                            <OptionSelect<GstRateValue>
                                value={forAll}
                                onValueChange={(rate) => {
                                    setForAll(rate);
                                    if (rate === "") return;
                                    setChoices(
                                        Object.fromEntries(
                                            open.map((row) => [
                                                rateKey(row),
                                                rate,
                                            ]),
                                        ),
                                    );
                                    setRefusal(null);
                                }}
                                options={GST_RATE_CHOICES}
                                placeholder={GST_RATE_PLACEHOLDER}
                                disabled={saving}
                                aria-label="GST rate for all of these"
                            />
                        </Field>
                    </div>
                ) : null}
                {rows.map((row) => {
                    const key = rateKey(row);
                    const value = choices[key] ?? "";
                    const name = rowName(row);
                    const price =
                        row.priceCents === undefined
                            ? null
                            : formatMoney(row.priceCents, row.currency);
                    const missing =
                        requireAll &&
                        tried &&
                        value === "" &&
                        row.canSet !== false;
                    return (
                        <Field
                            key={key}
                            // The label is a service's or a product's name.
                            holdsData
                            label={name}
                            hint={
                                price
                                    ? `${kindWord(row.kind)} · ${price}`
                                    : kindWord(row.kind)
                            }
                            error={missing ? GST_RATE_NEEDED : null}
                        >
                            <OptionSelect<GstRateValue>
                                value={value}
                                onValueChange={(rate) => {
                                    setChoices((had) => ({
                                        ...had,
                                        [key]: rate,
                                    }));
                                    // No longer one rate for all of them.
                                    if (rate !== forAll) setForAll("");
                                    setRefusal(null);
                                }}
                                options={GST_RATE_CHOICES}
                                placeholder={GST_RATE_PLACEHOLDER}
                                disabled={row.canSet === false || saving}
                                aria-label={`GST rate for ${name}`}
                            />
                        </Field>
                    );
                })}
                {note ? (
                    <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        {note}
                    </p>
                ) : null}
            </FormSheetBody>
            <FormSheetFoot
                saveLabel={saveLabel}
                pending={saving}
                note={<Refusal>{refusal}</Refusal>}
                onSubmit={submit}
            />
        </>
    );
}
