"use client";

import { useState } from "react";

import { EmailGate } from "../email-gate";
import { readNumber } from "../no-show-cost-calculator/logic";
import { money, toPaise } from "../numbers";
import {
    Chips,
    Field,
    Note,
    Result,
    ResultEmpty,
    ToolColumns,
    ToolForm,
    ToolSide,
} from "../parts";
import { ToConfirm } from "../to-confirm";
import type { GymInput, Rounding } from "./logic";
import {
    aMonth,
    planNote,
    planRows,
    plans,
    roundedLine,
    ROUNDING,
    WORDS,
} from "./logic";

type Key = "monthly" | "quarter" | "year";

/** A field's number, "empty", or "bad" when the sums can't use it. */
function read(key: Key, value: string): number | "empty" | "bad" {
    if (!value.trim()) return "empty";
    const n = readNumber(value);
    if (n === null) return "bad";
    if (key === "monthly" && n <= 0) return "bad";
    if (key !== "monthly" && n > 100) return "bad";
    return n;
}

/** The plans' input, or null while the monthly price is missing or a field is wrong. */
function inputOf(
    values: Record<Key, string>,
    rounding: Rounding,
): GymInput | null {
    const m = read("monthly", values.monthly);
    const q = read("quarter", values.quarter);
    const y = read("year", values.year);
    if (typeof m !== "number" || q === "bad" || y === "bad") return null;
    return {
        monthly: toPaise(m),
        quarter: q === "empty" ? 0 : q,
        year: y === "empty" ? 0 : y,
        rounding,
    };
}

/**
 * /tools/gym-membership-plan-calculator (design GymPlan*.dc.html): a
 * monthly price and two discounts in; each plan's price, its cost a month
 * and the member's saving out, as they type. A discount over 100% is
 * marked when they leave the field, and the last plans stay, marked. The
 * printable price list is behind the email gate. Nothing typed leaves the
 * browser.
 */
export default function GymPlanCalculator() {
    const [values, setValues] = useState<Record<Key, string>>({
        monthly: "",
        quarter: "",
        year: "",
    });
    const [rounding, setRounding] = useState<Rounding>("50");
    const [left, setLeft] = useState<Set<Key>>(new Set());
    const [last, setLast] = useState<GymInput | null>(null);

    function update(next: Record<Key, string>, r: Rounding) {
        setValues(next);
        setRounding(r);
        const i = inputOf(next, r);
        if (i) setLast(i);
    }

    const now = inputOf(values, rounding);
    const badKey = (["quarter", "year"] as const).find(
        (k) => read(k, values[k]) === "bad",
    );
    const held =
        !now && badKey && last && read("monthly", values.monthly) !== "empty"
            ? last
            : null;
    const input = now ?? held;
    const ps = input ? plans(input) : null;
    const twelve = ps?.[2];
    const rounded = input && ps ? roundedLine(input, ps) : null;

    const field = (key: Key, bad: string) => ({
        value: values[key],
        onChange: (e: { target: { value: string } }) =>
            update({ ...values, [key]: e.target.value }, rounding),
        onBlur: () => setLeft((was) => new Set(was).add(key)),
        error: left.has(key) && read(key, values[key]) === "bad" ? bad : null,
    });

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.monthly}
                    hint={WORDS.monthlyHint}
                    inputMode="decimal"
                    placeholder="1500"
                    prefix="₹"
                    {...field("monthly", WORDS.monthlyBad)}
                />
                <Field
                    label={WORDS.quarter}
                    inputMode="decimal"
                    placeholder="10"
                    suffix="%"
                    {...field("quarter", WORDS.discountBad)}
                />
                <Field
                    label={WORDS.year}
                    inputMode="decimal"
                    placeholder="20"
                    suffix="%"
                    {...field("year", WORDS.discountBad)}
                />
                <Chips
                    legend={WORDS.rounding}
                    options={ROUNDING}
                    value={rounding}
                    onChange={(r) => update(values, r)}
                    hint={WORDS.roundingHint}
                />
            </ToolForm>
            <ToolSide>
                {input && ps && twelve ? (
                    <Result
                        label={WORDS.label}
                        figureLabel={WORDS.figure}
                        figure={`${money(aMonth(twelve))} a month`}
                    >
                        <table className="gp-table">
                            <thead>
                                <tr>
                                    {WORDS.heads.map((h) => (
                                        <th key={h} scope="col">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {planRows(ps).map(([name, ...cells]) => (
                                    <tr key={name}>
                                        <th scope="row">{name}</th>
                                        {cells.map((c, n) => (
                                            <td key={n}>{c}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {rounded ? <p className="gp-small">{rounded}</p> : null}
                        <Note>
                            {held && badKey ? (
                                `Still showing ${held[badKey]}%. Fix the discount to work it out again.`
                            ) : (
                                <>
                                    {planNote(input, ps)} {WORDS.gst}{" "}
                                    <ToConfirm />
                                </>
                            )}
                        </Note>
                        <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                            <button
                                type="button"
                                className="tp-btn tp-btn-wide"
                                onClick={() => window.print()}
                            >
                                {WORDS.print}
                            </button>
                        </EmailGate>
                    </Result>
                ) : (
                    <ResultEmpty label={WORDS.label}>{WORDS.empty}</ResultEmpty>
                )}
            </ToolSide>
        </ToolColumns>
    );
}
