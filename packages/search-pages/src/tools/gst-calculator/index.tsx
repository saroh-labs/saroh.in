"use client";

import { EmailGate } from "../email-gate";

import { useState } from "react";

import { readPaise } from "../_documents/logic";
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
import { copyText } from "../td-parts";
import { gstCalc, OTHER, SLABS, WORDS, working } from "./logic";

const MODES = [
    { value: "before", label: WORDS.before },
    { value: "included", label: WORDS.included },
] as const;
const WHERE = [
    { value: "mine", label: WORDS.mine },
    { value: "another", label: WORDS.another },
] as const;
const OTHER_CHIPS = OTHER.map((r) => ({ value: r, label: `${r}%` }));

/**
 * /tools/gst-calculator (design GstCalculator*.dc.html): works out as they
 * type. A price that isn't one is marked when they leave it; the last
 * result stays, marked. It makes no file, so there's no email gate: Copy
 * puts the working on the clipboard. Nothing typed leaves the browser.
 */
export default function GstCalculator() {
    const [mode, setMode] = useState<"before" | "included">("before");
    const [price, setPrice] = useState("");
    const [left, setLeft] = useState(false);
    const [last, setLast] = useState<number | null>(null);
    const [rate, setRate] = useState("18");
    const [where, setWhere] = useState<"mine" | "another">("mine");
    const [copied, setCopied] = useState<"no" | "yes" | "failed">("no");

    const now = price.trim() ? readPaise(price) : null;
    const bad = price.trim() !== "" && now === null;
    const paise = now ?? (bad ? last : null);
    const isOther = (OTHER as readonly string[]).includes(rate);
    const result =
        paise === null
            ? null
            : gstCalc({
                  paise,
                  rate,
                  included: mode === "included",
                  inter: where === "another",
              });

    const chips = [
        ...SLABS.map((r) => ({ value: r, label: `${r}%` })),
        {
            value: "other",
            label: isOther ? `${WORDS.other}: ${rate}%` : WORDS.other,
        },
    ];

    async function copy() {
        if (!result) return;
        setCopied((await copyText(working(result))) ? "yes" : "failed");
    }

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Chips
                    legend={WORDS.mode}
                    options={MODES}
                    value={mode}
                    onChange={(v) => {
                        setMode(v);
                        setCopied("no");
                    }}
                />
                <Field
                    label={WORDS.price}
                    inputMode="decimal"
                    placeholder="1500"
                    prefix="₹"
                    value={price}
                    onChange={(e) => {
                        setPrice(e.target.value);
                        setCopied("no");
                        const p = readPaise(e.target.value);
                        if (p !== null) setLast(p);
                    }}
                    onBlur={() => setLeft(true)}
                    error={left && bad ? WORDS.priceBad : null}
                />
                <Chips
                    legend={WORDS.rate}
                    options={chips}
                    value={isOther ? "other" : rate}
                    onChange={(v) => {
                        setRate(v === "other" ? "12" : v);
                        setCopied("no");
                    }}
                    hint={WORDS.rateHint}
                />
                {isOther ? (
                    <Chips
                        legend={WORDS.otherRates}
                        options={OTHER_CHIPS}
                        value={rate}
                        onChange={setRate}
                    />
                ) : null}
                <Chips
                    legend={WORDS.where}
                    options={WHERE}
                    value={where}
                    onChange={(v) => {
                        setWhere(v);
                        setCopied("no");
                    }}
                />
            </ToolForm>
            <ToolSide>
                {result && paise !== null ? (
                    <Result
                        figureLabel={result.figureLabel}
                        figure={result.figure}
                        rows={result.rows}
                    >
                        {bad ? (
                            <Note>{WORDS.held(paise)}</Note>
                        ) : result.note ? (
                            <Note>{result.note}</Note>
                        ) : null}
                        <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                            <button
                                type="button"
                                className={`gc-copy ${copied === "yes" ? "gc-copied" : ""}`}
                                onClick={() => void copy()}
                            >
                                {copied === "yes" ? WORDS.copied : WORDS.copy}
                            </button>
                            {copied !== "no" ? (
                                <p role="status" className="gc-status">
                                    {copied === "yes"
                                        ? WORDS.copiedLine
                                        : WORDS.copyFailed}
                                </p>
                            ) : null}
                        </EmailGate>
                    </Result>
                ) : (
                    <ResultEmpty>{WORDS.empty}</ResultEmpty>
                )}
            </ToolSide>
        </ToolColumns>
    );
}
