"use client";

import Link from "next/link";

import { buttonClass } from "@/components/shared/button";
import { Field } from "@/components/shared/field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { useDraft } from "@/lib/tools/draft-store";
import { carryHref } from "@/lib/tools/handoff";
import type { FeeType } from "@/lib/tools/late-fee";
import { lateFee } from "@/lib/tools/late-fee";
import type { Currency } from "@/lib/tools/money";
import {
    CURRENCY_OPTIONS,
    formatMoney,
    formatPlain,
    parseNumber,
    toCents,
} from "@/lib/tools/money";

import { CopyButton, Section, SelectField } from "./fields";
import type { MomentCopy } from "./signup-moment";
import { NextStepCard, SignupSheet, useSignupMoment } from "./signup-moment";

interface LateFeeDraft {
    amount: string;
    days: string;
    grace: string;
    rate: string;
    type: FeeType;
    currency: Currency;
}

const START: LateFeeDraft = {
    amount: "1200",
    days: "45",
    grace: "0",
    rate: "1.5",
    type: "month",
    currency: "USD",
};

const TOOL = "late-fee-calculator";

const TYPES: { value: FeeType; label: string }[] = [
    { value: "flat", label: "Flat" },
    { value: "month", label: "% a month" },
    { value: "year", label: "% a year" },
];

export function LateFeeTool({ copy }: { copy: MomentCopy }) {
    const [d, set] = useDraft<LateFeeDraft>(
        "saroh.tech.late-fee",
        START,
        () => START,
        TOOL,
    );
    const amount = toCents(parseNumber(d.amount));
    const rate = parseNumber(d.rate);
    const flat = d.type === "flat";
    const r = lateFee({
        type: d.type,
        amount,
        rate: flat ? toCents(rate) : rate,
        daysLate: parseNumber(d.days),
        graceDays: parseNumber(d.grace),
    });
    const money = (cents: number) => formatMoney(cents, d.currency);
    const line = flat
        ? `Late fee (flat, invoice ${r.charged} days overdue): ${money(r.fee)}`
        : `Late fee: ${rate}% a ${d.type === "month" ? "month" : "year"} on ${money(amount)} for ${r.charged} days: ${money(r.fee)}`;
    const moment = useSignupMoment(TOOL);
    return (
        <div className="grid items-start gap-7 lg:grid-cols-2">
            <Section title="The invoice">
                <div className="grid grid-cols-2 gap-3">
                    <Field
                        label="Invoice amount"
                        inputMode="decimal"
                        className="[&_input]:font-mono"
                        value={d.amount}
                        onChange={(e) => set({ amount: e.target.value })}
                    />
                    <Field
                        label="Days late"
                        inputMode="numeric"
                        className="[&_input]:font-mono"
                        value={d.days}
                        onChange={(e) => set({ days: e.target.value })}
                    />
                </div>
                <SelectField
                    label="Currency"
                    value={d.currency}
                    options={CURRENCY_OPTIONS}
                    onChange={(currency) => set({ currency })}
                />
                <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold">Fee type</span>
                    <SegmentedControl
                        legend="Fee type"
                        value={d.type}
                        options={TYPES}
                        onChange={(type) => set({ type })}
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field
                        label={flat ? "Fee amount" : "Rate %"}
                        inputMode="decimal"
                        className="[&_input]:font-mono"
                        value={d.rate}
                        onChange={(e) => set({ rate: e.target.value })}
                    />
                    <Field
                        label="Grace days"
                        inputMode="numeric"
                        className="[&_input]:font-mono"
                        value={d.grace}
                        onChange={(e) => set({ grace: e.target.value })}
                    />
                </div>
            </Section>
            <div className="flex min-w-0 flex-col gap-3.5">
                <section
                    aria-live="polite"
                    aria-label="Late fee"
                    className="flex flex-col gap-2 rounded-card border border-ink bg-surface p-4 md:p-6"
                >
                    <span className="text-[13px] text-quiet">Late fee</span>
                    <span className="font-mono text-4xl font-semibold tracking-tight">
                        {money(r.fee)}
                    </span>
                    <div>
                        {[
                            ["Days charged", String(r.charged)],
                            ["Invoice amount", money(amount)],
                            ["New total due", money(r.total)],
                        ].map(([label, value]) => (
                            <div
                                key={label}
                                className="flex justify-between gap-3 border-t border-line py-2.5"
                            >
                                <span>{label}</span>
                                <span className="font-mono">{value}</span>
                            </div>
                        ))}
                    </div>
                    <div className="rounded-control bg-paper p-3 text-[15px]">
                        <span className="text-[13px] text-quiet">
                            Line to add to the invoice
                        </span>
                        <br />
                        {line}
                    </div>
                    <div className="grid grid-cols-[1fr_1.6fr] gap-2 pt-1">
                        <CopyButton
                            label="Copy line"
                            className="!h-[52px]"
                            text={line}
                            onCopied={() => moment.finished("Line copied")}
                        />
                        <Link
                            prefetch={false}
                            className={buttonClass("primary")}
                            href={carryHref("/tools/invoice-generator", {
                                currency: d.currency,
                                items: [
                                    {
                                        description: line.split(":")[0],
                                        qty: "1",
                                        rate: formatPlain(r.fee),
                                    },
                                ],
                            })}
                        >
                            Add to an invoice
                        </Link>
                    </div>
                </section>
                <NextStepCard copy={copy} tool={TOOL} done={moment.done} />
                <p className="m-0 rounded-card border border-line bg-surface p-4 text-[15px] leading-normal">
                    <b>Before you charge it</b>
                    <br />
                    Only add a late fee if your terms said so before the work
                    started. Some countries set rules on late payment interest
                    (the UK does, for example).{" "}
                    <Link prefetch={false} href="/guides/payment-terms">
                        Check yours
                    </Link>
                    . Not legal advice.
                </p>
            </div>
            <SignupSheet
                copy={copy}
                tool={TOOL}
                done={moment.sheet}
                onClose={moment.closeSheet}
            />
        </div>
    );
}
