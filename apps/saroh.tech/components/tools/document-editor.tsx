"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/shared/button";
import { Chip } from "@/components/shared/chip";
import { Field, INPUT_CLASS } from "@/components/shared/field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { addDays, todayIso } from "@/lib/tools/dates";
import type {
    DepositPlan,
    DocDraft,
    DocStyle,
    FromDetails,
    Item,
    Terms,
} from "@/lib/tools/document";
import {
    applyCarry,
    documentView,
    dueFor,
    lineCents,
    newId,
    TERM_LABELS,
    totals,
} from "@/lib/tools/document";
import { useDraft } from "@/lib/tools/draft-store";
import { carryHref, decodeDraft } from "@/lib/tools/handoff";
import { CURRENCY_OPTIONS, formatMoney } from "@/lib/tools/money";

import { DeskActions, DownloadProblem, useDownload } from "./document-actions";
import { DocumentPreview } from "./document-preview";
import { DateField, Section, SelectField, TextArea } from "./fields";
import { FromSection, NO_FROM } from "./from-section";
import type { MomentCopy } from "./signup-moment";
import { NextStepCard, SignupSheet, useSignupMoment } from "./signup-moment";

export const FROM_KEY = "saroh.tech.from";

const STYLES: { value: DocStyle; label: string }[] = [
    { value: "plain", label: "Plain" },
    { value: "bold", label: "Bold" },
    { value: "compact", label: "Compact" },
];

const DEPOSITS: { value: DepositPlan; label: string }[] = [
    { value: "none", label: "None" },
    { value: "20", label: "20%" },
    { value: "30", label: "30%" },
    { value: "50", label: "50%" },
    { value: "amount", label: "Amount" },
];

const empty = (kind: "invoice" | "quote"): DocDraft => ({
    number: kind === "invoice" ? "INV-0001" : "Q-0001",
    issued: "",
    due: "",
    terms: "net30",
    currency: "USD",
    clientName: "",
    clientEmail: "",
    clientAddress: "",
    items: [{ id: "first", description: "", qty: "1", rate: "" }],
    taxes: [{ id: "tax", name: "", rate: "" }],
    discount: null,
    discountMode: "percent",
    depositPaid: null,
    payLink: "",
    bank: "",
    note: "",
    style: "plain",
    estimate: false,
    depositPlan: "none",
    depositAmount: "",
    termsText: "",
    signLine: true,
});

const SERVER = { invoice: empty("invoice"), quote: empty("quote") };

const fresh = (kind: "invoice" | "quote") => () => {
    const issued = todayIso();
    return {
        ...SERVER[kind],
        issued,
        due: addDays(issued, kind === "invoice" ? 30 : 14),
    };
};

/** The invoice generator and the quote maker: one editor, two jobs. */
export function DocumentEditor({
    kind,
    tool,
    copy,
}: {
    kind: "invoice" | "quote";
    tool: string;
    copy: MomentCopy;
}) {
    const invoice = kind === "invoice";
    const [d, set, clearDraft] = useDraft<DocDraft>(
        `saroh.tech.${kind}`,
        SERVER[kind],
        fresh(kind),
        tool,
    );
    const [from, setFrom, clearFrom] = useDraft<FromDetails>(
        FROM_KEY,
        NO_FROM,
        () => NO_FROM,
    );
    const [tab, setTab] = useState<"edit" | "preview">("edit");
    const [openItem, setOpenItem] = useState<string | null>(null);

    // Another tool's line or a quote's work, once, then out of the address.
    useEffect(() => {
        const hash = location.hash;
        if (!hash.startsWith("#carry=")) return;
        history.replaceState(null, "", location.pathname);
        const carry = decodeDraft(hash.slice("#carry=".length));
        set((current) => applyCarry(current, carry));
    }, [set]);

    const t = useMemo(() => totals(d), [d]);
    const view = useMemo(() => documentView(kind, d, from), [kind, d, from]);
    const money = (cents: number) => formatMoney(cents, d.currency);
    const handoff = useMemo(
        () => ({ tool, kind, draft: d, from }),
        [tool, kind, d, from],
    );
    const moment = useSignupMoment(handoff);
    const { busy, problem, download } = useDownload(
        view,
        tool,
        moment.finished,
    );

    const setItem = (id: string, patch: Partial<Item>) =>
        set({
            items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        });
    const addItem = (optional = false) => {
        const id = newId();
        setOpenItem(id);
        set({
            items: [
                ...d.items,
                { id, description: "", qty: "1", rate: "", optional },
            ],
        });
    };
    const setTerms = (terms: Terms) =>
        set({ terms, due: dueFor(d.issued, terms, d.due) });

    const totalLabel = invoice
        ? "Total due"
        : `${d.estimate ? "Estimate" : "Quote"} total`;
    const totalValue = money(invoice ? t.due : t.total);

    return (
        <div className="flex flex-col gap-4">
            <div className="lg:hidden">
                <SegmentedControl
                    legend="View"
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: "edit", label: "Edit" },
                        { value: "preview", label: "Preview" },
                    ]}
                />
            </div>

            <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_560px]">
                <div
                    className={`min-w-0 flex-col gap-4 lg:flex ${
                        tab === "edit" ? "flex" : "hidden"
                    }`}
                >
                    {invoice ? null : (
                        <Section title="Call it a">
                            <SegmentedControl
                                legend="Document type"
                                value={d.estimate ? "estimate" : "quote"}
                                onChange={(v) =>
                                    set({ estimate: v === "estimate" })
                                }
                                options={[
                                    { value: "quote", label: "Quote" },
                                    { value: "estimate", label: "Estimate" },
                                ]}
                            />
                            <span className="text-[13px] text-quiet">
                                A quote is a fixed price. An estimate is your
                                best guess and can change.{" "}
                                <Link
                                    prefetch={false}
                                    href="/guides/quote-vs-estimate"
                                >
                                    Which one?
                                </Link>
                            </span>
                        </Section>
                    )}

                    <FromSection from={from} onChange={setFrom} />

                    <Section title="Bill to">
                        <div className="grid gap-3 md:grid-cols-2">
                            <Field
                                label="Client name"
                                value={d.clientName}
                                onChange={(e) =>
                                    set({ clientName: e.target.value })
                                }
                            />
                            <Field
                                label="Client email"
                                type="email"
                                value={d.clientEmail}
                                onChange={(e) =>
                                    set({ clientEmail: e.target.value })
                                }
                            />
                            <div className="md:col-span-2">
                                <Field
                                    label="Client address"
                                    hint="(optional)"
                                    value={d.clientAddress}
                                    onChange={(e) =>
                                        set({ clientAddress: e.target.value })
                                    }
                                />
                            </div>
                        </div>
                    </Section>

                    <Section title="Details">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <Field
                                label={invoice ? "Invoice number" : "Number"}
                                className="[&_input]:font-mono"
                                value={d.number}
                                onChange={(e) =>
                                    set({ number: e.target.value })
                                }
                            />
                            <DateField
                                label={invoice ? "Issue date" : "Date"}
                                value={d.issued}
                                onChange={(issued) =>
                                    set({
                                        issued,
                                        due: invoice
                                            ? dueFor(issued, d.terms, d.due)
                                            : d.due,
                                    })
                                }
                            />
                            <DateField
                                label={invoice ? "Due date" : "Valid until"}
                                value={d.due}
                                onChange={(due) =>
                                    set(
                                        invoice
                                            ? { due, terms: "custom" }
                                            : { due },
                                    )
                                }
                            />
                            <SelectField
                                label="Currency"
                                value={d.currency}
                                options={CURRENCY_OPTIONS}
                                onChange={(currency) => set({ currency })}
                            />
                        </div>
                        {invoice ? (
                            <div
                                role="group"
                                aria-label="Payment terms"
                                className="flex flex-wrap items-center gap-2"
                            >
                                <span className="text-[13px] text-quiet">
                                    Payment terms
                                </span>
                                {(Object.keys(TERM_LABELS) as Terms[]).map(
                                    (term) => (
                                        <Chip
                                            key={term}
                                            on={d.terms === term}
                                            onClick={() => setTerms(term)}
                                        >
                                            {TERM_LABELS[term]}
                                        </Chip>
                                    ),
                                )}
                            </div>
                        ) : null}
                    </Section>

                    <Section
                        title={invoice ? "Items" : "Work and prices"}
                        aside={
                            <span className="text-[13px] text-quiet md:hidden">
                                {d.items.length}
                            </span>
                        }
                    >
                        <div
                            aria-hidden="true"
                            className="hidden grid-cols-[minmax(0,1fr)_70px_110px_110px_28px] gap-2.5 text-xs font-semibold uppercase tracking-[.08em] text-quiet md:grid"
                        >
                            <span>Description</span>
                            <span>Qty</span>
                            <span>Rate</span>
                            <span className="text-right">Amount</span>
                            <span />
                        </div>
                        {d.items.map((item, i) => {
                            const folded =
                                i >= 2 &&
                                openItem !== item.id &&
                                item.description !== "";
                            return (
                                <div key={item.id}>
                                    {folded ? (
                                        <button
                                            type="button"
                                            onClick={() => setOpenItem(item.id)}
                                            className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent p-0 text-left font-sans text-[15px] text-ink md:hidden"
                                        >
                                            <span>
                                                {item.description} · {item.qty}{" "}
                                                × {item.rate}
                                            </span>
                                            <span className="font-mono">
                                                {money(lineCents(item))}
                                            </span>
                                        </button>
                                    ) : null}
                                    <div
                                        className={`grid-cols-[56px_minmax(0,1fr)_minmax(84px,auto)_44px] items-center gap-2.5 md:grid-cols-[minmax(0,1fr)_70px_110px_110px_28px] ${
                                            folded ? "hidden md:grid" : "grid"
                                        }`}
                                    >
                                        <input
                                            aria-label={`Item ${i + 1} description`}
                                            placeholder={
                                                item.optional
                                                    ? "Optional extra"
                                                    : "What you did or will do"
                                            }
                                            value={item.description}
                                            onChange={(e) =>
                                                setItem(item.id, {
                                                    description: e.target.value,
                                                })
                                            }
                                            className={`${INPUT_CLASS} col-span-4 md:col-span-1`}
                                        />
                                        <input
                                            aria-label={`Item ${i + 1} quantity`}
                                            inputMode="decimal"
                                            value={item.qty}
                                            onChange={(e) =>
                                                setItem(item.id, {
                                                    qty: e.target.value,
                                                })
                                            }
                                            className={INPUT_CLASS}
                                        />
                                        <input
                                            aria-label={`Item ${i + 1} rate`}
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            value={item.rate}
                                            onChange={(e) =>
                                                setItem(item.id, {
                                                    rate: e.target.value,
                                                })
                                            }
                                            className={INPUT_CLASS}
                                        />
                                        <span className="text-right font-mono text-sm">
                                            {money(lineCents(item))}
                                        </span>
                                        <button
                                            type="button"
                                            aria-label={`Remove item ${i + 1}`}
                                            disabled={d.items.length === 1}
                                            onClick={() =>
                                                set({
                                                    items: d.items.filter(
                                                        (x) => x.id !== item.id,
                                                    ),
                                                })
                                            }
                                            className="h-11 cursor-pointer border-0 bg-transparent text-lg text-ink disabled:cursor-default disabled:opacity-30 md:h-10"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        <div className="flex flex-wrap gap-2.5">
                            <Button look="secondary" onClick={() => addItem()}>
                                + Add item
                            </Button>
                            {invoice ? null : (
                                <Button
                                    look="secondary"
                                    onClick={() => addItem(true)}
                                >
                                    + Optional extra
                                </Button>
                            )}
                        </div>
                    </Section>

                    <Section title={invoice ? "Tax and discount" : "Tax"}>
                        {d.taxes.map((tax, i) => (
                            <div
                                key={tax.id}
                                className="grid grid-cols-[minmax(0,1fr)_96px_44px] items-end gap-3 md:grid-cols-[minmax(0,1fr)_120px_44px]"
                            >
                                <Field
                                    label="Tax name"
                                    placeholder="VAT, GST, Sales tax"
                                    value={tax.name}
                                    onChange={(e) =>
                                        set({
                                            taxes: d.taxes.map((x) =>
                                                x.id === tax.id
                                                    ? {
                                                          ...x,
                                                          name: e.target.value,
                                                      }
                                                    : x,
                                            ),
                                        })
                                    }
                                />
                                <Field
                                    label="Rate %"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={tax.rate}
                                    onChange={(e) =>
                                        set({
                                            taxes: d.taxes.map((x) =>
                                                x.id === tax.id
                                                    ? {
                                                          ...x,
                                                          rate: e.target.value,
                                                      }
                                                    : x,
                                            ),
                                        })
                                    }
                                />
                                <button
                                    type="button"
                                    aria-label={`Remove tax line ${i + 1}`}
                                    onClick={() =>
                                        set({
                                            taxes: d.taxes.filter(
                                                (x) => x.id !== tax.id,
                                            ),
                                        })
                                    }
                                    className="h-11 cursor-pointer border-0 bg-transparent text-lg text-ink md:h-10"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        <span className="text-[13px] text-quiet">
                            You choose the rate.{" "}
                            <Link
                                prefetch={false}
                                href="/guides/vat-and-sales-tax-basics"
                            >
                                Check your country's rate
                            </Link>
                        </span>
                        {d.discount !== null ? (
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-end gap-3">
                                <Field
                                    label="Discount"
                                    inputMode="decimal"
                                    value={d.discount}
                                    onChange={(e) =>
                                        set({ discount: e.target.value })
                                    }
                                />
                                <SelectField
                                    label="Taken off as"
                                    value={d.discountMode}
                                    options={[
                                        { value: "percent", label: "Percent" },
                                        { value: "amount", label: "Amount" },
                                    ]}
                                    onChange={(discountMode) =>
                                        set({ discountMode })
                                    }
                                />
                                <button
                                    type="button"
                                    aria-label="Remove discount"
                                    onClick={() => set({ discount: null })}
                                    className="h-11 cursor-pointer border-0 bg-transparent text-lg text-ink md:h-10"
                                >
                                    ×
                                </button>
                            </div>
                        ) : null}
                        {invoice && d.depositPaid !== null ? (
                            <div className="grid grid-cols-[minmax(0,1fr)_44px] items-end gap-3">
                                <Field
                                    label="Deposit paid"
                                    inputMode="decimal"
                                    value={d.depositPaid}
                                    onChange={(e) =>
                                        set({ depositPaid: e.target.value })
                                    }
                                />
                                <button
                                    type="button"
                                    aria-label="Remove deposit paid"
                                    onClick={() => set({ depositPaid: null })}
                                    className="h-11 cursor-pointer border-0 bg-transparent text-lg text-ink md:h-10"
                                >
                                    ×
                                </button>
                            </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2.5">
                            <Button
                                look="secondary"
                                onClick={() =>
                                    set({
                                        taxes: [
                                            ...d.taxes,
                                            {
                                                id: newId(),
                                                name: "",
                                                rate: "",
                                            },
                                        ],
                                    })
                                }
                            >
                                + Another tax line
                            </Button>
                            {d.discount === null ? (
                                <Button
                                    look="secondary"
                                    onClick={() => set({ discount: "" })}
                                >
                                    + Discount
                                </Button>
                            ) : null}
                            {invoice && d.depositPaid === null ? (
                                <Button
                                    look="secondary"
                                    onClick={() => set({ depositPaid: "" })}
                                >
                                    + Deposit paid
                                </Button>
                            ) : null}
                        </div>
                    </Section>

                    {invoice ? (
                        <Section title="How to pay you">
                            <div className="grid gap-3 md:grid-cols-2">
                                <Field
                                    label="Payment link"
                                    hint="(Stripe, PayPal…)"
                                    type="url"
                                    placeholder="https://"
                                    value={d.payLink}
                                    onChange={(e) =>
                                        set({ payLink: e.target.value })
                                    }
                                />
                                <Field
                                    label="Bank details"
                                    hint="(optional)"
                                    value={d.bank}
                                    onChange={(e) =>
                                        set({ bank: e.target.value })
                                    }
                                />
                            </div>
                            <TextArea
                                label="Note to client"
                                value={d.note}
                                onChange={(e) => set({ note: e.target.value })}
                            />
                        </Section>
                    ) : (
                        <>
                            <Section title="Deposit to start">
                                <div
                                    role="group"
                                    aria-label="Deposit"
                                    className="flex flex-wrap gap-2"
                                >
                                    {DEPOSITS.map((o) => (
                                        <Chip
                                            key={o.value}
                                            on={d.depositPlan === o.value}
                                            onClick={() =>
                                                set({ depositPlan: o.value })
                                            }
                                        >
                                            {o.label}
                                        </Chip>
                                    ))}
                                </div>
                                {d.depositPlan === "amount" ? (
                                    <Field
                                        label="Deposit amount"
                                        inputMode="decimal"
                                        value={d.depositAmount}
                                        onChange={(e) =>
                                            set({
                                                depositAmount: e.target.value,
                                            })
                                        }
                                    />
                                ) : null}
                                {d.depositPlan !== "none" ? (
                                    <div className="flex justify-between gap-3 text-[15px]">
                                        <span>Deposit due on acceptance</span>
                                        <span className="font-mono">
                                            {money(t.depositDue)}
                                        </span>
                                    </div>
                                ) : null}
                            </Section>
                            <Section title="Terms">
                                <TextArea
                                    label="What's included and what's not"
                                    placeholder="Price includes parts listed. Extra work only after you agree to it."
                                    value={d.termsText}
                                    onChange={(e) =>
                                        set({ termsText: e.target.value })
                                    }
                                />
                                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] md:min-h-0">
                                    <input
                                        type="checkbox"
                                        checked={d.signLine}
                                        onChange={(e) =>
                                            set({ signLine: e.target.checked })
                                        }
                                        className="size-5 accent-ink"
                                    />
                                    Add a line for the client to sign
                                </label>
                            </Section>
                        </>
                    )}
                </div>

                <aside
                    className={`min-w-0 flex-col gap-3.5 lg:flex print:!flex ${
                        tab === "preview" ? "flex" : "hidden"
                    }`}
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div
                            role="group"
                            aria-label="Style"
                            className="flex gap-2"
                        >
                            {STYLES.map((s) => (
                                <Chip
                                    key={s.value}
                                    on={d.style === s.value}
                                    onClick={() => set({ style: s.value })}
                                >
                                    {s.label}
                                </Chip>
                            ))}
                        </div>
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
                    <div className="hidden flex-col gap-3.5 lg:flex">
                        <DeskActions busy={busy} onDownload={download} />
                        <DownloadProblem problem={problem} />
                        <NextStepCard
                            copy={copy}
                            handoff={handoff}
                            done={moment.done}
                        />
                    </div>
                </aside>
            </div>

            <div className="sticky bottom-2 z-10 flex flex-col gap-2.5 rounded-card border border-[rgba(28,28,26,.2)] bg-surface p-3 shadow-[0_-8px_24px_-12px_rgba(28,28,26,.25)] lg:hidden print:hidden">
                <div className="flex items-baseline justify-between px-1">
                    <span className="text-[13px] text-quiet">{totalLabel}</span>
                    <span
                        className="font-mono text-[17px] font-semibold"
                        aria-live="polite"
                    >
                        {totalValue}
                    </span>
                </div>
                <DownloadProblem problem={problem} />
                <div className="grid grid-cols-[1fr_1.6fr] gap-2">
                    {tab === "edit" ? (
                        <Button
                            look="secondary"
                            className="!h-[52px]"
                            onClick={() => setTab("preview")}
                        >
                            Preview
                        </Button>
                    ) : (
                        <Button
                            look="secondary"
                            className="!h-[52px]"
                            onClick={() => window.print()}
                        >
                            Print
                        </Button>
                    )}
                    <Button disabled={busy} onClick={download}>
                        {busy ? "Making…" : "Download PDF"}
                    </Button>
                </div>
            </div>

            <div className="flex flex-col gap-3 lg:hidden">
                <NextStepCard
                    copy={copy}
                    handoff={handoff}
                    done={moment.done}
                />
            </div>

            {invoice ? null : (
                <Link
                    prefetch={false}
                    href={carryHref("/tools/invoice-generator", {
                        clientName: d.clientName,
                        clientEmail: d.clientEmail,
                        clientAddress: d.clientAddress,
                        currency: d.currency,
                        items: d.items
                            .filter((i) => !i.optional)
                            .map(({ description, qty, rate }) => ({
                                description,
                                qty,
                                rate,
                            })),
                        taxes: d.taxes.map(({ name, rate }) => ({
                            name,
                            rate,
                        })),
                    })}
                    className="inline-flex min-h-11 items-center self-start text-[15px] font-semibold"
                >
                    Turn this into an invoice →
                </Link>
            )}

            <SignupSheet
                copy={copy}
                handoff={handoff}
                done={moment.sheet}
                onClose={moment.closeSheet}
            />
        </div>
    );
}
