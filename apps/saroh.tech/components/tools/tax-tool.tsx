"use client";

import Link from "next/link";

import { buttonClass } from "@/components/shared/button";
import { Chip } from "@/components/shared/chip";
import { Field } from "@/components/shared/field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { useDraft } from "@/lib/tools/draft-store";
import { carryHref } from "@/lib/tools/handoff";
import type { Currency } from "@/lib/tools/money";
import {
    CURRENCY_OPTIONS,
    formatMoney,
    parseNumber,
    toCents,
} from "@/lib/tools/money";
import type { TaxKind, TaxMode } from "@/lib/tools/tax";
import { TAX_KINDS, taxBreakdown } from "@/lib/tools/tax";

import { CopyButton, SelectField } from "./fields";
import type { MomentCopy } from "./signup-moment";
import { NextStepCard, SignupSheet, useSignupMoment } from "./signup-moment";

interface TaxDraft {
    mode: TaxMode;
    amount: string;
    rate: string;
    currency: Currency;
}

/** VAT, sales tax and GST: one calculator, a real page at each address. */
export function TaxTool({
    kind,
    tool,
    copy,
}: {
    kind: TaxKind;
    tool: string;
    copy: MomentCopy;
}) {
    const k = TAX_KINDS[kind];
    const start: TaxDraft = {
        mode: "add",
        amount: "100",
        rate: k.presets[0].rate,
        currency: k.currency,
    };
    const [d, set] = useDraft<TaxDraft>(
        `saroh.tech.tax.${kind}`,
        start,
        () => start,
        tool,
    );
    const rate = parseNumber(d.rate);
    const b = taxBreakdown(d.mode, toCents(parseNumber(d.amount)), rate);
    const money = (cents: number) => formatMoney(cents, d.currency);
    const moment = useSignupMoment(tool);
    const rows: [string, string][] = [
        [`Before ${k.lower}`, money(b.net)],
        [`${k.name} at ${rate}%`, money(b.tax)],
    ];
    return (
        <div className="grid items-start gap-7 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-3.5">
                <nav
                    aria-label="Tax type"
                    className="grid grid-cols-3 gap-1 rounded-button bg-[#EAE6DE] p-1"
                >
                    {(Object.keys(TAX_KINDS) as TaxKind[]).map((id) => (
                        <Link
                            key={id}
                            prefetch={false}
                            href={TAX_KINDS[id].path}
                            aria-current={id === kind ? "page" : undefined}
                            className={`flex min-h-11 items-center justify-center rounded-control text-[14.5px] font-semibold no-underline md:min-h-10 ${
                                id === kind
                                    ? "bg-surface shadow-[0_1px_2px_rgba(28,28,26,.18)]"
                                    : ""
                            }`}
                        >
                            {TAX_KINDS[id].name}
                        </Link>
                    ))}
                </nav>
                <section className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4 md:p-6">
                    <SegmentedControl
                        legend="Add or remove"
                        value={d.mode}
                        onChange={(mode) => set({ mode })}
                        options={[
                            { value: "add", label: `Add ${k.lower}` },
                            { value: "remove", label: `Remove ${k.lower}` },
                        ]}
                    />
                    <Field
                        label={
                            d.mode === "add"
                                ? `Price before ${k.lower}`
                                : `Total including ${k.lower}`
                        }
                        inputMode="decimal"
                        className="[&_input]:!h-[52px] [&_input]:font-mono [&_input]:!text-xl"
                        value={d.amount}
                        onChange={(e) => set({ amount: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <Field
                            label="Rate %"
                            inputMode="decimal"
                            className="[&_input]:font-mono"
                            value={d.rate}
                            onChange={(e) => set({ rate: e.target.value })}
                        />
                        <SelectField
                            label="Currency"
                            value={d.currency}
                            options={CURRENCY_OPTIONS}
                            onChange={(currency) => set({ currency })}
                        />
                    </div>
                    <div
                        role="group"
                        aria-label="Example rates"
                        className="flex flex-wrap gap-1.5"
                    >
                        {k.presets.map((p) => (
                            <Chip
                                key={p.label}
                                on={d.rate === p.rate}
                                onClick={() => set({ rate: p.rate })}
                            >
                                {p.label}
                            </Chip>
                        ))}
                    </div>
                    <span className="text-[13px] text-quiet">
                        {k.note}{" "}
                        <Link
                            prefetch={false}
                            href="/guides/vat-and-sales-tax-basics"
                        >
                            Check the current rate
                        </Link>
                    </span>
                </section>
            </div>
            <div className="flex min-w-0 flex-col gap-3.5">
                <section
                    aria-live="polite"
                    aria-label="Result"
                    className="flex flex-col rounded-card border border-ink bg-surface p-4 md:p-6"
                >
                    {rows.map(([label, value], i) => (
                        <div
                            key={label}
                            className={`flex justify-between gap-3 py-2.5 ${
                                i ? "border-t border-line" : ""
                            }`}
                        >
                            <span>{label}</span>
                            <span className="font-mono">{value}</span>
                        </div>
                    ))}
                    <div className="flex justify-between gap-3 border-t border-line py-2.5 text-xl font-bold">
                        <span>Total</span>
                        <span className="font-mono">{money(b.gross)}</span>
                    </div>
                    <div className="grid grid-cols-[1fr_1.6fr] gap-2 pt-2">
                        <CopyButton
                            label="Copy"
                            className="!h-[52px]"
                            text={[...rows, ["Total", money(b.gross)]]
                                .map(([l, v]) => `${l}: ${v}`)
                                .join("\n")}
                            onCopied={() => moment.finished("Copied")}
                        />
                        <Link
                            prefetch={false}
                            className={buttonClass("primary")}
                            href={carryHref("/tools/invoice-generator", {
                                currency: d.currency,
                                taxes: [{ name: k.name, rate: d.rate }],
                            })}
                        >
                            Use on an invoice
                        </Link>
                    </div>
                </section>
                <NextStepCard copy={copy} tool={tool} done={moment.done} />
            </div>
            <SignupSheet
                copy={copy}
                tool={tool}
                done={moment.sheet}
                onClose={moment.closeSheet}
            />
        </div>
    );
}
