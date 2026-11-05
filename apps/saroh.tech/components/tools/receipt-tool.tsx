"use client";

import { CheckRow } from "@saroh/ui/check-row";
import { Field as FieldFrame } from "@saroh/ui/field";
import { useEffect, useMemo } from "react";

import { Button } from "@/components/shared/button";
import { Chip } from "@/components/shared/chip";
import { DateField, Field, SelectField } from "@/components/shared/field";
import { todayIso } from "@/lib/tools/dates";
import type { FromDetails } from "@/lib/tools/document";
import { useDraft } from "@/lib/tools/draft-store";
import { decodeDraft } from "@/lib/tools/handoff";
import { CURRENCY_OPTIONS } from "@/lib/tools/money";
import type { ReceiptDraft } from "@/lib/tools/receipt";
import { applyReceiptCarry, PAID_BY, receiptView } from "@/lib/tools/receipt";

import { DownloadProblem, SavedNote, useDownload } from "./document-actions";
import { FROM_KEY } from "./document-editor";
import { DocumentPreview } from "./document-preview";
import { Section } from "./fields";
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
    const moment = useSignupMoment(TOOL);
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
                    <div className="grid grid-cols-2 gap-3">
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
                    <FieldFrame group label="Paid by">
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
                    </FieldFrame>
                    <Field
                        label="For"
                        optional
                        placeholder="Invoice number, what it was for"
                        value={d.paidFor}
                        onChange={(e) => set({ paidFor: e.target.value })}
                    />
                    <CheckRow
                        checked={d.showTax}
                        onChange={(showTax) => set({ showTax })}
                    >
                        Show tax included
                    </CheckRow>
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
                    <span className="text-[13px] text-muted-foreground">
                        Preview
                    </span>
                    <SavedNote
                        savedAt={d.savedAt}
                        onClear={() => {
                            clearDraft();
                            clearFrom();
                        }}
                    />
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
                <NextStepCard copy={copy} tool={TOOL} done={moment.done} />
            </aside>
            <SignupSheet
                copy={copy}
                tool={TOOL}
                done={moment.sheet}
                onClose={moment.closeSheet}
            />
        </div>
    );
}
