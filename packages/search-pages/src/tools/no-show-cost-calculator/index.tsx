"use client";

import { useState } from "react";

import { rupee } from "../../money";
import { EmailGate } from "../email-gate";
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
import type { Deposit, NoShowInput } from "./logic";
import {
    depositNote,
    DEPOSITS,
    noShowCost,
    readNumber,
    resultRows,
    WORDS,
} from "./logic";

type Key = "bookings" | "rate" | "average";

const BAD: Record<Key, string> = {
    bookings: WORDS.bookingsBad,
    rate: WORDS.rateBad,
    average: WORDS.averageBad,
};

/** A field's number, "empty", or "bad" when it isn't one the sums can use. */
function read(key: Key, value: string): number | "empty" | "bad" {
    if (!value.trim()) return "empty";
    const n = readNumber(value);
    if (n === null) return "bad";
    if (key === "rate" && n > 100) return "bad";
    return n;
}

/**
 * /tools/no-show-cost-calculator (design NoShowCost*.dc.html): works out as
 * they type, with no button. A field is checked when they leave it; while
 * one is wrong the last result stays, marked. The working is free on
 * screen; printing it (save as PDF) is behind the email gate. Nothing
 * typed leaves the browser.
 */
export default function NoShowCostCalculator() {
    const [values, setValues] = useState<Record<Key, string>>({
        bookings: "",
        rate: "",
        average: "",
    });
    const [deposit, setDeposit] = useState<Deposit>("quarter");
    const [left, setLeft] = useState<Set<Key>>(new Set());
    const [last, setLast] = useState<Omit<NoShowInput, "deposit"> | null>(null);

    const read3 = {
        bookings: read("bookings", values.bookings),
        rate: read("rate", values.rate),
        average: read("average", values.average),
    };
    const bad = (Object.keys(read3) as Key[]).filter((k) => read3[k] === "bad");
    const empty = (Object.keys(read3) as Key[]).some(
        (k) => read3[k] === "empty",
    );
    const now =
        !empty && bad.length === 0
            ? {
                  bookings: read3.bookings as number,
                  rate: read3.rate as number,
                  average: read3.average as number,
              }
            : null;
    const shown = now ?? (bad.length > 0 && !empty ? last : null);

    function change(key: Key, value: string) {
        const next = { ...values, [key]: value };
        setValues(next);
        const b = read("bookings", next.bookings);
        const r = read("rate", next.rate);
        const a = read("average", next.average);
        if (
            typeof b === "number" &&
            typeof r === "number" &&
            typeof a === "number"
        )
            setLast({ bookings: b, rate: r, average: a });
    }

    const field = (key: Key) => ({
        value: values[key],
        onChange: (e: { target: { value: string } }) =>
            change(key, e.target.value),
        onBlur: () => setLeft((was) => new Set(was).add(key)),
        error: left.has(key) && read3[key] === "bad" ? BAD[key] : null,
    });

    const input = shown ? { ...shown, deposit } : null;
    const cost = input ? noShowCost(input) : null;
    const held =
        shown && !now
            ? bad.includes("rate") && last
                ? `Still showing ${last.rate}%. Fix the rate to work it out again.`
                : "Still showing your last numbers. Fix the one marked to work it out again."
            : null;

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.bookings}
                    hint={WORDS.bookingsHint}
                    inputMode="numeric"
                    placeholder="40"
                    {...field("bookings")}
                />
                <Field
                    label={WORDS.rate}
                    hint={WORDS.rateHint}
                    inputMode="decimal"
                    placeholder="10"
                    suffix="%"
                    {...field("rate")}
                />
                <Field
                    label={WORDS.average}
                    inputMode="decimal"
                    placeholder="800"
                    prefix="₹"
                    {...field("average")}
                />
                <Chips
                    legend={WORDS.deposit}
                    options={DEPOSITS}
                    value={deposit}
                    onChange={setDeposit}
                    hint={WORDS.depositHint}
                />
            </ToolForm>
            <ToolSide>
                {input && cost ? (
                    <Result
                        figureLabel={
                            <>
                                <span className="sp-d">{WORDS.figure}</span>
                                <span className="sp-p">
                                    {WORDS.phoneFigure}
                                </span>
                            </>
                        }
                        figure={rupee(Math.round(cost.lostMonth))}
                        rows={resultRows(input, cost)}
                    >
                        <Note>{held ?? depositNote(input, cost)}</Note>
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
