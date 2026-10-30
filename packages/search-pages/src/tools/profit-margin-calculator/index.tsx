"use client";

import { useState } from "react";

import { EmailGate } from "../email-gate";
import { readNumber } from "../no-show-cost-calculator/logic";
import { percent, toPaise } from "../numbers";
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
import type { Mode } from "./logic";
import {
    margin,
    marginNote,
    MODES,
    OTHER_RATES,
    RATE_CHIPS,
    resultRows,
    WORDS,
} from "./logic";

type Key = "cost" | "price" | "target";

/**
 * /tools/profit-margin-calculator (design ProfitMargin*.dc.html): works
 * out as they type. A field is checked when they leave it; a margin of
 * 100% or more drops only the price-for-a-margin line. Printing the
 * working is behind the email gate. Nothing typed leaves the browser.
 */
export default function ProfitMarginCalculator() {
    const [values, setValues] = useState<Record<Key, string>>({
        cost: "",
        price: "",
        target: "",
    });
    const [mode, setMode] = useState<Mode>("with");
    const [rate, setRate] = useState("18");
    const [left, setLeft] = useState<Set<Key>>(new Set());

    const cost = readNumber(values.cost);
    const price = readNumber(values.price);
    const target = values.target.trim() ? readNumber(values.target) : null;
    const bad: Record<Key, boolean> = {
        cost: !!values.cost.trim() && cost === null,
        price: !!values.price.trim() && (price === null || price <= 0),
        target: !!values.target.trim() && (target === null || target >= 100),
    };

    const field = (key: Key, error: string) => ({
        value: values[key],
        onChange: (e: { target: { value: string } }) =>
            setValues((was) => ({ ...was, [key]: e.target.value })),
        onBlur: () => setLeft((was) => new Set(was).add(key)),
        error: left.has(key) && bad[key] ? error : null,
    });

    const input =
        cost !== null && price !== null && price > 0
            ? {
                  cost: toPaise(cost),
                  price: toPaise(price),
                  mode,
                  rate,
                  target: bad.target ? null : target,
              }
            : null;
    const m = input ? margin(input) : null;
    const note = input && m ? marginNote(input, m) : null;
    const main = RATE_CHIPS.some((c) => c.value === rate);

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.cost}
                    hint={
                        <>
                            {WORDS.costHint} <ToConfirm />
                        </>
                    }
                    inputMode="decimal"
                    placeholder="600"
                    prefix="₹"
                    {...field("cost", WORDS.costBad)}
                />
                <Field
                    label={WORDS.price}
                    inputMode="decimal"
                    placeholder="1000"
                    prefix="₹"
                    {...field("price", WORDS.priceBad)}
                />
                <div className="tb-seg">
                    <Chips
                        legend={WORDS.mode}
                        options={MODES}
                        value={mode}
                        onChange={setMode}
                    />
                </div>
                <div className="tb-pills">
                    <Chips
                        legend={WORDS.rate}
                        options={RATE_CHIPS}
                        value={main ? rate : "other"}
                        onChange={(v) => setRate(v === "other" ? "12" : v)}
                        hint={WORDS.rateHint}
                    />
                </div>
                {main ? null : (
                    <div className="tp-field">
                        <label htmlFor="pm-other" className="tp-label">
                            {WORDS.other}
                        </label>
                        <select
                            id="pm-other"
                            className="tp-input"
                            value={rate}
                            onChange={(e) => setRate(e.target.value)}
                        >
                            {OTHER_RATES.map((r) => (
                                <option key={r} value={r}>
                                    {r}%
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <Field
                    label={WORDS.target}
                    hint={WORDS.targetHint}
                    inputMode="decimal"
                    placeholder="50"
                    suffix="%"
                    {...field("target", WORDS.targetBad)}
                />
            </ToolForm>
            <ToolSide>
                {input && m ? (
                    <Result
                        figureLabel={WORDS.figure}
                        figure={percent(m.margin)}
                        rows={resultRows(input, m)}
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
                ) : (
                    <ResultEmpty>{WORDS.empty}</ResultEmpty>
                )}
            </ToolSide>
        </ToolColumns>
    );
}
