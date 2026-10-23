"use client";

import { useRef, useState } from "react";

import type { RatesSaved } from "@/components/gst-rates/gst-rates-sheet";
import { GstRatesSheet } from "@/components/gst-rates/gst-rates-sheet";
import { saveGstRates } from "@/lib/gst-rates/actions";
import type { ChosenRate, RateItem } from "@/lib/gst-rates/missing";
import { askWhy, savedWhere } from "@/lib/gst-rates/missing";

/** Any action's result: a success, or a failure that may name the items. */
interface Outcome {
    ok: boolean;
    rates?: RateItem[];
}

/** What was started, and the sheet's Save that carries on with it. */
export interface StepWords {
    /** For the sheet's line: "take this payment", "issue this invoice". */
    then: string;
    /** The sheet's Save: "Save and take payment". */
    continueLabel: string;
}

/** A typed line's rate, by its place on the invoice. */
export type LineRates = Readonly<Record<number, string>>;

/**
 * Carry an action through the GST rate ask (12 Oct 2026). `run` calls the
 * action; when the API refuses it because an item on the paper has no GST
 * rate (`GST_RATE_MISSING`), the sheet opens in place with one row per
 * item, and once the rates are saved the same action runs again and its
 * result is returned as if nothing had stood in the way. Closed without
 * saving, `run` answers `null`: the person chose not to, so there is
 * nothing to report.
 *
 * The rate of anything sold (a service, a product, a plan, a class pack, a
 * course) is saved on it, so it is asked once. A line typed on an invoice
 * has nowhere but the invoice: its screen passes `saveLines`, which writes
 * the rates to the draft.
 *
 * An action that answers `null` itself (another step it went through was
 * closed) is passed straight on.
 *
 * Render `step` once, beside whatever opened it.
 */
export function useGstRateStep({
    then,
    continueLabel,
    saveLines,
}: StepWords & {
    /** Write typed lines' rates to their invoice; only its screens pass it. */
    saveLines?: (rates: LineRates) => Promise<RatesSaved>;
}) {
    const [asking, setAsking] = useState<{
        items: RateItem[];
        words: StepWords;
    } | null>(null);
    const answer = useRef<((saved: boolean) => void) | null>(null);

    function ask(items: RateItem[], words: StepWords): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            answer.current = resolve;
            setAsking({ items, words });
        });
    }

    /**
     * `words` names this action where one screen starts more than one
     * through the same step (take a payment, or make a payment link).
     */
    async function run<R extends Outcome>(
        action: () => Promise<R | null>,
        words: StepWords = { then, continueLabel },
    ): Promise<R | null> {
        const res = await action();
        if (!res || res.ok || !res.rates?.length) return res;
        const saved = await ask(res.rates, words);
        if (!saved) return null;
        return run(action, words);
    }

    /** Items go to the API in one save; typed lines to their invoice. */
    async function save(chosen: ChosenRate[]): Promise<RatesSaved> {
        const items = chosen.filter((c) => c.kind !== "LINE");
        const lines = chosen.filter((c) => c.kind === "LINE");
        if (items.length > 0) {
            const res = await saveGstRates(items);
            if (!res.ok) return { ok: false, error: res.error };
        }
        if (lines.length > 0) {
            if (!saveLines) {
                return {
                    ok: false,
                    error: "Open the invoice to choose its lines' GST rates.",
                };
            }
            return saveLines(
                Object.fromEntries(lines.map((l) => [Number(l.id), l.rate])),
            );
        }
        return { ok: true };
    }

    const done = (saved: number | null) => {
        setAsking(null);
        answer.current?.(saved !== null);
        answer.current = null;
    };

    const items = asking?.items ?? null;
    const step = (
        <GstRatesSheet
            rows={items}
            title={
                items && items.length > 1
                    ? "Choose GST rates"
                    : "Choose a GST rate"
            }
            description={asking ? askWhy(asking.items, asking.words.then) : ""}
            saveLabel={asking?.words.continueLabel ?? continueLabel}
            requireAll
            // The refusal doesn't say how the business's prices carry GST,
            // so nothing sold is told either way here. A plan's note says
            // its members carry the rate from their next renewal.
            note={items ? savedWhere(items, null) : undefined}
            save={save}
            onDone={done}
        />
    );
    return { run, step };
}
