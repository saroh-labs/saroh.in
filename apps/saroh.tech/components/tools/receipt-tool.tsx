"use client";

import { useEffect, useMemo } from "react";

import { Button } from "@/components/shared/button";
import { Chip } from "@/components/shared/chip";
import { Field } from "@/components/shared/field";
import { todayIso } from "@/lib/tools/dates";
import type { FromDetails } from "@/lib/tools/document";
import { useDraft } from "@/lib/tools/draft-store";
import { decodeDraft } from "@/lib/tools/handoff";
import { CURRENCY_OPTIONS } from "@/lib/tools/money";
import type { ReceiptDraft } from "@/lib/tools/receipt";
import { applyReceiptCarry, PAID_BY, receiptView } from "@/lib/tools/receipt";

import { DownloadProblem, useDownload } from "./document-actions";
import { FROM_KEY } from "./document-editor";
import { DocumentPreview } from "./document-preview";
import { DateField, Section, SelectField } from "./fields";
import { FromSection, NO_FROM } from "./from-section";
import type { MomentCopy } from "./signup-moment";
import { NextStepCard, SignupSheet, useSignupMoment } from "./signup-moment";

const SERVER: ReceiptDraft = {
    number: "RCT-0001",
    receivedFrom: "",
    amount: "",
    currency: "USD",
    paidOn: "",
    paidBy: "Bank transfer",
    paidFor: "",
    showTax: false,
    taxName: "",
    taxRate: "",
};

const TOOL = "receipt-maker";

export function ReceiptTool({ copy }: { copy: MomentCopy }) {
    const [d, set, clearDraft] = useDraft<ReceiptDraft>(
        "saroh.tech.receipt",
        SERVER,
        () => ({ ...SERVER, paidOn: todayIso() }),
        TOOL,
    );
    const [from, setFrom, clearFrom] = useDraft<FromDetails>(
        FROM_KEY,
        NO_FROM,
        () => NO_FROM,
    );
    // A template's example, once, then out of the address.
    useEffect(() => {
        const hash = location.hash;
        if (!hash.startsWith("#carry=")) return;
        history.replaceState(null, "", location.pathname);
        set(applyReceiptCarry(decodeDraft(hash.slice("#carry=".length))));
    }, [set]);
    const view = useMemo(() => receiptView(d, from), [d, from]);
    const handoff = useMemo(
        () => ({ tool: TOOL, kind: "receipt", draft: d, from }),
        [d, from],
    );
    const moment = useSignupMoment(handoff);
    const { busy, problem, download } = useDownload(
        view,
        TOOL,
        moment.finished,
    );
    return (
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_560px]">
            <div className="flex min-w-0 flex-col gap-4">
                <FromSection from={from} onChange={setFrom} />
                <Section title="The payment">
                    <Field
                        label="Received from"
                        value={d.receivedFrom}
                        onChange={(e) => set({ receivedFrom: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Field
                            label="Amount"
                            inputMode="decimal"
                            placeholder="0.00"
                            className="[&_input]:font-mono"
                            value={d.amount}
                            onChange={(e) => set({ amount: e.target.value })}
                        />
                        <SelectField
                            label="Currency"
                            value={d.currency}
                            options={CURRENCY_OPTIONS}
                            onChange={(currency) => set({ currency })}
                        />
                        <DateField
                            label="Paid on"
                            value={d.paidOn}
                            onChange={(paidOn) => set({ paidOn })}
                        />
                        <Field
                            label="Receipt number"
                            className="[&_input]:font-mono"
                            value={d.number}
                            onChange={(e) => set({ number: e.target.value })}
                        />
                    </div>
                    <div
                        role="group"
                        aria-label="Paid by"
                        className="flex flex-col gap-1.5"
                    >
                        <span className="text-[13px] font-semibold">
                            Paid by
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {PAID_BY.map((m) => (
                                <Chip
                                    key={m}
                                    on={d.paidBy === m}
                                    onClick={() => set({ paidBy: m })}
                                >
                                    {m}
                                </Chip>
                            ))}
                        </div>
                    </div>
                    <Field
                        label="For"
                        hint="(optional)"
                        placeholder="Invoice number, what it was for"
                        value={d.paidFor}
                        onChange={(e) => set({ paidFor: e.target.value })}
                    />
                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] md:min-h-0">
                        <input
                            type="checkbox"
                            checked={d.showTax}
                            onChange={(e) => set({ showTax: e.target.checked })}
                            className="size-5 accent-ink"
                        />
                        Show tax included
                    </label>
                    {d.showTax ? (
                        <div className="grid grid-cols-2 gap-3">
                            <Field
                                label="Tax name"
                                placeholder="VAT, GST"
                                value={d.taxName}
                                onChange={(e) =>
                                    set({ taxName: e.target.value })
                                }
                            />
                            <Field
                                label="Rate %"
                                inputMode="decimal"
                                value={d.taxRate}
                                onChange={(e) =>
                                    set({ taxRate: e.target.value })
                                }
                            />
                        </div>
                    ) : null}
                </Section>
            </div>
            <aside className="flex min-w-0 flex-col gap-3.5 print:!flex">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-quiet">Preview</span>
                    <span className="flex items-center gap-2 text-[13px] text-quiet">
                        {d.savedAt
                            ? `Saved in this browser · ${d.savedAt}`
                            : "Stays in this browser"}
                        <button
                            type="button"
                            onClick={() => {
                                clearDraft();
                                clearFrom();
                            }}
                            className="min-h-11 cursor-pointer border-0 bg-transparent p-0 font-sans text-[13px] text-ink underline md:min-h-0"
                        >
                            Clear
                        </button>
                    </span>
                </div>
                <DocumentPreview view={view} />
                <DownloadProblem problem={problem} />
                <div className="grid grid-cols-[1fr_1.6fr] gap-2.5 lg:grid-cols-[1.6fr_1fr]">
                    <Button
                        look="secondary"
                        className="!h-[52px] lg:order-2"
                        onClick={() => window.print()}
                    >
                        Print
                    </Button>
                    <Button disabled={busy} onClick={download}>
                        {busy ? "Making…" : "Download PDF"}
                    </Button>
                </div>
                <NextStepCard
                    copy={copy}
                    handoff={handoff}
                    done={moment.done}
                />
            </aside>
            <SignupSheet
                copy={copy}
                handoff={handoff}
                done={moment.sheet}
                onClose={moment.closeSheet}
            />
        </div>
    );
}
