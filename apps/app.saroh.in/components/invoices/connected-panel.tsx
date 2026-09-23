import Link from "next/link";
import type { ReactNode } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import {
    customerHref,
    invoiceHref,
    sourceHint,
    sourceHref,
} from "@/lib/invoices/links";
import type { Invoice } from "@/lib/invoices/service";
import { billedTo, isOwed, paidBy, sourceLine } from "@/lib/invoices/status";

/** A white panel in the right-hand column, with its eyebrow. */
export function SidePanel({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-[12px] border border-border bg-card px-4 py-[13px] print:hidden">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {label}
            </h2>
            {children}
        </section>
    );
}

interface ConnectedLink {
    label: string;
    sub: string;
    href: string;
}

/**
 * "Connected", after the design: what this invoice belongs to — the order,
 * subscription or pack that made it, the invoice it corrects and the
 * corrections against it, the customer, and how many more invoices they
 * have and whether any are unpaid. Each is a link to where it is changed.
 */
export function ConnectedPanel({
    invoice: i,
    others,
}: {
    invoice: Invoice;
    /** The customer's other invoices; null when they could not be read. */
    others: Invoice[] | null;
}) {
    const money = (a: string) => formatMoneyMajor(a, i.currency) ?? a;
    const who = billedTo(i);
    const first = who.name.split(" ")[0] ?? who.name;
    const src = sourceHref(i);
    const rest = others?.filter((o) => o.id !== i.id) ?? null;
    const unpaid = rest?.filter(isOwed).length ?? 0;

    const links: ConnectedLink[] = [
        src
            ? {
                  label: sourceLine({ ...i, kind: "INVOICE" }),
                  sub: sourceHint(i),
                  href: src,
              }
            : null,
        i.related
            ? {
                  label: `${i.kind === "CREDIT_NOTE" ? "Cancels" : "Adds to"} ${i.related.number ?? "an invoice"}`,
                  sub: "The invoice it corrects",
                  href: invoiceHref(i.related.id),
              }
            : null,
        ...(i.corrections ?? []).map((c) => ({
            label: `${c.kind === "CREDIT_NOTE" ? "Credit note" : "Supplementary invoice"} ${c.number ?? ""}`.trim(),
            sub:
                c.kind === "CREDIT_NOTE"
                    ? `−${money(c.total)} off this invoice`
                    : `+${money(c.total)} on top of this invoice`,
            href: invoiceHref(c.id),
        })),
        i.reissuedAsId
            ? {
                  label: "The invoice that replaced it",
                  sub: "Voided and written again",
                  href: invoiceHref(i.reissuedAsId),
              }
            : null,
        i.reissuedFromId
            ? {
                  label: "The invoice it replaces",
                  sub: "Voided, and this written in its place",
                  href: invoiceHref(i.reissuedFromId),
              }
            : null,
        who.contactId
            ? {
                  label: who.name,
                  sub: "Customer — orders, subscriptions and all invoices",
                  href: customerHref(who.contactId, true),
              }
            : null,
        who.contactId && rest && rest.length > 0
            ? {
                  label: `${rest.length} more ${rest.length === 1 ? "invoice" : "invoices"} for ${first}`,
                  sub: unpaid ? `${unpaid} still unpaid` : "All paid",
                  href: customerHref(who.contactId, true),
              }
            : null,
    ].filter((l): l is ConnectedLink => l !== null);

    return (
        <SidePanel label="Connected">
            {links.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                    Written by hand for someone no longer in your contacts —
                    nothing else is connected to it.
                </p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {links.map((l) => (
                        <li key={`${l.href}-${l.label}`}>
                            <Link
                                href={l.href}
                                className="flex items-center gap-2 rounded-[9px] border border-border px-[11px] py-[9px] text-foreground transition-colors duration-fast hover:border-border-strong"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-semibold">
                                        {l.label}
                                    </span>
                                    {l.sub ? (
                                        <span className="block text-[12px] text-muted-foreground">
                                            {l.sub}
                                        </span>
                                    ) : null}
                                </span>
                                <span aria-hidden>→</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            {others === null && who.contactId ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                    {first}&apos;s other invoices could not be counted just now.
                </p>
            ) : null}
        </SidePanel>
    );
}

/**
 * "What happened", newest first — from the invoice's own dates, so it says
 * only what is recorded: drafted, issued, paid (and how), voided, and the
 * corrections made against it.
 */
export function HistoryPanel({ invoice: i }: { invoice: Invoice }) {
    const money = (a: string) => formatMoneyMajor(a, i.currency) ?? a;
    const events: { what: string; when: string | null; key: string }[] = [];
    for (const c of i.corrections ?? []) {
        events.push({
            key: c.id,
            what: `${c.kind === "CREDIT_NOTE" ? "Credit note" : "Supplementary invoice"} ${c.number ?? ""} for ${money(c.total)}`,
            when: null,
        });
    }
    if (i.voidedAt) {
        events.push({
            key: "void",
            what: `Voided${i.voidReason ? ` — ${i.voidReason}` : ""}`,
            when: i.voidedAt,
        });
    }
    if (i.paidAt) {
        events.push({
            key: "paid",
            what: i.payment
                ? `Paid by ${paidBy(i.payment.method).toLowerCase()}${i.payment.reference ? ` · ${i.payment.reference}` : ""}`
                : "Paid",
            when: i.paidAt,
        });
    }
    if (i.issuedAt) {
        const by = i.order
            ? ` for order #${i.order.number}`
            : i.issuedAutomatically
              ? " by the subscription renewal"
              : "";
        events.push({
            key: "issued",
            what: `${i.number ?? "It"} issued${by}`,
            when: i.issuedAt,
        });
    }
    if (!i.issuedAutomatically && !i.order) {
        events.push({ key: "drafted", what: "Drafted", when: i.createdAt });
    }
    if (events.length === 0) return null;
    return (
        <SidePanel label="What happened">
            <ol>
                {events.map((e) => (
                    <li key={e.key} className="py-[5px]">
                        <p className="text-[13px] font-semibold">{e.what}</p>
                        {e.when ? (
                            <p className="text-[12px] text-muted-foreground">
                                <ViewerDate iso={e.when} variant="datetime" />
                            </p>
                        ) : null}
                    </li>
                ))}
            </ol>
        </SidePanel>
    );
}
