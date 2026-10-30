"use client";

import { useState } from "react";

import {
    amountInWords,
    money,
    readPaise,
    untouched,
} from "../_documents/logic";
import {
    DocDate,
    DocGate,
    DocNote,
    DocNumber,
    DocSet,
    DocTool,
    LinesEditor,
    Paper,
    PaperEmpty,
    Small,
    Tc,
    useDraft,
} from "../_documents/parts";
import { Chips, Field } from "../parts";
import type { ReceiptForm } from "./logic";
import {
    amountProblem,
    NUMBER_PLACEHOLDER,
    PAID_BY,
    receipt,
    REFERENCE,
    shareLink,
    START,
    WORDS,
} from "./logic";

/**
 * /tools/receipt-maker (design ReceiptMaker*.dc.html): a numbered receipt
 * drawn as they type, free; the PDF and the WhatsApp share are behind the
 * email gate. An amount over the total is marked when they leave it, and
 * the last good receipt stays. Kept in this browser only.
 */
export default function ReceiptMaker() {
    const [f, setF] = useDraft<ReceiptForm>("saroh-tool:receipt-maker", START);
    const [amountLeft, setAmountLeft] = useState(false);
    const [held, setHeld] = useState<number | null>(null);
    const set = (patch: Partial<ReceiptForm>) => setF({ ...f, ...patch });
    const { paper, received, due } = receipt(f, held);
    const total = received + due;
    const problem = amountProblem(f.amount, total);
    const ref = f.paidBy !== "cash" ? REFERENCE[f.paidBy] : null;

    return (
        <DocTool
            formLabel={WORDS.form}
            label={WORDS.aside}
            form={
                <>
                    <DocSet legend={WORDS.you} cols={3}>
                        <Field
                            label="Business name"
                            value={f.name}
                            placeholder="Your business"
                            autoComplete="organization"
                            onChange={(e) => set({ name: e.target.value })}
                        />
                        <Field
                            label="Address"
                            value={f.address}
                            placeholder="Area, city"
                            onChange={(e) => set({ address: e.target.value })}
                        />
                        <Field
                            label={WORDS.gstin}
                            value={f.gstin}
                            className="td-mono"
                            autoCapitalize="characters"
                            onChange={(e) =>
                                set({ gstin: e.target.value.toUpperCase() })
                            }
                        />
                    </DocSet>
                    <DocSet legend={WORDS.from} cols={2}>
                        <Field
                            label={WORDS.name}
                            value={f.customer}
                            placeholder="Customer's name"
                            onChange={(e) => set({ customer: e.target.value })}
                        />
                        <Field
                            label={WORDS.mobile}
                            type="tel"
                            inputMode="tel"
                            value={f.mobile}
                            placeholder={WORDS.mobilePlaceholder}
                            onChange={(e) => set({ mobile: e.target.value })}
                        />
                    </DocSet>
                    <DocSet legend={WORDS.payment}>
                        <div className="td-grid td-grid-2">
                            <DocNumber
                                label={WORDS.number}
                                value={f.number}
                                placeholder={NUMBER_PLACEHOLDER}
                                hint={WORDS.numberHint}
                                onChange={(number) => set({ number })}
                            />
                            <DocDate
                                label={WORDS.date}
                                value={f.date}
                                onChange={(date) => set({ date })}
                            />
                        </div>
                        <Chips
                            legend={WORDS.paidBy}
                            options={PAID_BY}
                            value={f.paidBy}
                            onChange={(paidBy) => set({ paidBy })}
                        />
                        <div className="td-grid td-grid-2">
                            {ref ? (
                                <Field
                                    label={`${ref.label} (optional)`}
                                    value={f.reference}
                                    hint={ref.hint}
                                    className="td-mono"
                                    onChange={(e) =>
                                        set({ reference: e.target.value })
                                    }
                                />
                            ) : null}
                            <Field
                                label={WORDS.amount}
                                inputMode="decimal"
                                prefix="₹"
                                value={f.amount}
                                placeholder={
                                    total ? String(total / 100) : "3000"
                                }
                                hint={WORDS.amountHint}
                                error={amountLeft ? problem : null}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (!amountProblem(f.amount, total))
                                        setHeld(
                                            f.amount.trim()
                                                ? readPaise(f.amount)
                                                : null,
                                        );
                                    set({ amount: v });
                                }}
                                onBlur={() => setAmountLeft(true)}
                            />
                        </div>
                    </DocSet>
                    <DocSet legend={WORDS.lines}>
                        <LinesEditor
                            lines={f.lines}
                            onChange={(lines) => set({ lines })}
                            codes={false}
                            placeholder={{
                                item: "What they paid for",
                                rate: "2500",
                            }}
                        />
                    </DocSet>
                </>
            }
        >
            {untouched(f.name, f.lines) ? (
                <PaperEmpty>{WORDS.empty}</PaperEmpty>
            ) : (
                <>
                    <Paper {...paper}>
                        <div className="td-words">
                            {amountInWords(received)}
                        </div>
                        <DocNote>{WORDS.thanks}</DocNote>
                        {due > 0 ? (
                            <div className="td-due">
                                <span>{WORDS.due}</span>
                                <span className="td-amt">{money(due)}</span>
                            </div>
                        ) : null}
                    </Paper>
                    {problem ? <DocNote>{WORDS.held(received)}</DocNote> : null}
                    <Small>
                        {WORDS.under} <Tc />
                    </Small>
                    <DocGate
                        what="receipt"
                        file={paper.num}
                        share={shareLink(f, received)}
                        shareLabel={WORDS.share}
                    />
                </>
            )}
        </DocTool>
    );
}
