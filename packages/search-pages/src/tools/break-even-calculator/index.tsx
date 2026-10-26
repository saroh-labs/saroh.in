"use client";

import { useState } from "react";

import { EmailGate } from "../email-gate";
import { readNumber } from "../no-show-cost-calculator/logic";
import { money, toPaise } from "../numbers";
import {
    Field,
    Note,
    Result,
    ResultEmpty,
    ToolColumns,
    ToolForm,
    ToolSide,
} from "../parts";
import { breakEven, gapNote, noBreakEven, resultRows, WORDS } from "./logic";

type Key = "average" | "perSale" | "days" | "now";

const BAD: Record<Key, string> = {
    average: WORDS.averageBad,
    perSale: WORDS.perSaleBad,
    days: WORDS.daysBad,
    now: WORDS.nowBad,
};

/** A field's number, "empty", or "bad" when the sums can't use it. */
function read(key: Key | "cost", value: string): number | "empty" | "bad" {
    if (!value.trim()) return "empty";
    const n = readNumber(value);
    if (n === null) return "bad";
    if (key === "days" && (n < 1 || n > 31 || !Number.isInteger(n)))
        return "bad";
    if (key === "now" && !Number.isInteger(n)) return "bad";
    if (key === "average" && n <= 0) return "bad";
    return n;
}

/**
 * /tools/break-even-calculator (design BreakEven*.dc.html): the month's
 * fixed costs (three to start, more on "Add a cost"), the average sale and
 * what a sale costs; works out as they type. A sale that costs as much as
 * it brings has no break-even, and says so. Printing the working is behind
 * the email gate. Nothing typed leaves the browser.
 */
export default function BreakEvenCalculator() {
    const [costs, setCosts] = useState(() =>
        WORDS.costs.map((label): { label: string; value: string } => ({
            label,
            value: "",
        })),
    );
    const [values, setValues] = useState<Record<Key, string>>({
        average: "",
        perSale: "",
        days: "26",
        now: "",
    });
    const [left, setLeft] = useState<Set<string>>(new Set());
    const leave = (key: string) => () =>
        setLeft((was) => new Set(was).add(key));

    const r = {
        average: read("average", values.average),
        perSale: read("perSale", values.perSale),
        days: read("days", values.days),
        now: read("now", values.now),
    };
    const costRead = costs.map((c) => read("cost", c.value));
    const fixed = costRead.reduce<number>(
        (sum, c) => sum + (typeof c === "number" ? toPaise(c) : 0),
        0,
    );
    const average = typeof r.average === "number" ? toPaise(r.average) : null;
    const perSale = typeof r.perSale === "number" ? toPaise(r.perSale) : null;
    const never =
        average !== null && perSale !== null && perSale >= average
            ? noBreakEven(average, perSale)
            : null;
    const ready =
        fixed > 0 &&
        average !== null &&
        perSale !== null &&
        typeof r.days === "number" &&
        r.now !== "bad" &&
        !costRead.includes("bad");
    const input =
        ready && !never
            ? {
                  fixed,
                  average,
                  perSale,
                  days: r.days as number,
                  now: typeof r.now === "number" ? r.now : null,
              }
            : null;
    const b = input ? breakEven(input) : null;
    const note = input && b ? gapNote(input, b) : null;

    const field = (key: Key) => ({
        value: values[key],
        onChange: (e: { target: { value: string } }) =>
            setValues((was) => ({ ...was, [key]: e.target.value })),
        onBlur: leave(key),
        error:
            left.has(key) && r[key] === "bad"
                ? BAD[key]
                : key === "perSale" && left.has(key)
                  ? never
                  : null,
    });

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <fieldset className="tb-set">
                    <legend className="tb-legend">{WORDS.fixed}</legend>
                    <div className="be-grid be-grid-3">
                        {costs.map((c, n) => (
                            <Field
                                key={n}
                                label={c.label}
                                inputMode="decimal"
                                placeholder={
                                    ["40000", "35000", "10000"][n] ?? ""
                                }
                                prefix="₹"
                                value={c.value}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setCosts((was) =>
                                        was.map((x, i) =>
                                            i === n ? { ...x, value } : x,
                                        ),
                                    );
                                }}
                                onBlur={leave(`cost${n}`)}
                                error={
                                    left.has(`cost${n}`) &&
                                    costRead[n] === "bad"
                                        ? WORDS.costBad
                                        : null
                                }
                            />
                        ))}
                    </div>
                    <div className="be-total">
                        <button
                            type="button"
                            className="tb-btn2"
                            onClick={() =>
                                setCosts((was) => [
                                    ...was,
                                    {
                                        label: `${WORDS.another} ${was.length - WORDS.costs.length + 1}`,
                                        value: "",
                                    },
                                ])
                            }
                        >
                            {WORDS.addCost}
                        </button>
                        {fixed > 0 ? (
                            <span className="be-sum">
                                {money(fixed)} a month
                            </span>
                        ) : null}
                    </div>
                </fieldset>
                <fieldset className="tb-set">
                    <legend className="tb-legend">{WORDS.sales}</legend>
                    <div className="be-grid">
                        <Field
                            label={WORDS.average}
                            hint={WORDS.averageHint}
                            inputMode="decimal"
                            placeholder="500"
                            prefix="₹"
                            {...field("average")}
                        />
                        <Field
                            label={WORDS.perSale}
                            hint={WORDS.perSaleHint}
                            inputMode="decimal"
                            placeholder="200"
                            prefix="₹"
                            {...field("perSale")}
                        />
                        <Field
                            label={WORDS.days}
                            inputMode="numeric"
                            placeholder="26"
                            {...field("days")}
                        />
                        <Field
                            label={WORDS.now}
                            hint={WORDS.nowHint}
                            inputMode="numeric"
                            placeholder="Like 250"
                            {...field("now")}
                        />
                    </div>
                </fieldset>
            </ToolForm>
            <ToolSide>
                {input && b ? (
                    <Result
                        figureLabel={WORDS.figure}
                        figure={`${b.sales} a month`}
                        rows={resultRows(input, b)}
                    >
                        {note ? <Note>{note}</Note> : null}
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
                ) : never ? (
                    <Result>
                        <span className="tp-figure-label">{WORDS.figure}</span>
                        <p aria-live="polite" className="be-none">
                            {WORDS.none}
                        </p>
                    </Result>
                ) : (
                    <ResultEmpty>{WORDS.empty}</ResultEmpty>
                )}
            </ToolSide>
        </ToolColumns>
    );
}
