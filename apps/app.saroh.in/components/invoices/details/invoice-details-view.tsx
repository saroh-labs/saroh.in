"use client";

import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import type { ReactNode } from "react";
import { useId } from "react";

import { EmailNoteText } from "@/components/communications/email-note";
import { ConnectedPanel } from "@/components/invoices/connected-panel";
import { ShareAndMore } from "@/components/invoices/details/action-bar";
import { DetailsHistory } from "@/components/invoices/details/history";
import { MoneyCard } from "@/components/invoices/details/money-card";
import { useDetailsActions } from "@/components/invoices/details/use-details-actions";
import { InvoicePaper } from "@/components/invoices/invoice-paper";
import { OfflinePayHint } from "@/components/invoices/offline-pay-hint";
import { PaymentsToRefund } from "@/components/invoices/pay-link";
import { UnseenLinkNote } from "@/components/invoices/unseen-link";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { INVOICE_EMAIL_WORDS } from "@/lib/communications/email-setup";
import type { InvoiceDetails } from "@/lib/invoices/details";
import { wasSent } from "@/lib/invoices/send";
import {
    billedTo,
    headerPill,
    moneyMessage,
    sourceLine,
} from "@/lib/invoices/status";
import { NEXT_REMINDER_AFTER, REMINDED_TODAY } from "@/lib/invoices/words";
import { invoiceZone } from "@/lib/invoices/zone";

/** Where the menus open from: up from a sheet's foot, down from a header. */
export interface MenuPlace {
    align?: "start" | "end";
    side?: "top" | "bottom";
}

/**
 * One invoice's details (DEC-173, U9 #1121, INVPageA and the right of
 * INVListAC): the money card with the state's one main button and what
 * sits beside it, then "What happened", what it is connected to, and the
 * paper as the customer gets it. Share and More hold every other action
 * (`actionsFor`), and each opens over the details and comes back to them.
 *
 * Drawn as the invoice's page (`layout="page"`: the header carries the
 * number, the pill and the menus; the paper on the left) and inside the
 * list's side sheet (`layout="sheet"`: the sheet's header says what it is;
 * the menus sit in a bar held to the sheet's foot, with what `foot` adds).
 * Print leaves only the paper either way.
 */
export function InvoiceDetailsView({
    details,
    layout,
    onChanged,
    onGone,
    print = () => window.print(),
    foot,
}: {
    details: InvoiceDetails;
    layout: "page" | "sheet";
    /** A write happened: read the details again. */
    onChanged: () => void;
    /** A draft was deleted. Left out, the list is shown. */
    onGone?: () => void;
    print?: () => void;
    /** The sheet's foot (`layout="sheet"`): the menus, then Previous and Next. */
    foot?: (menus: ReactNode) => ReactNode;
}) {
    const { invoice: i, can } = details;
    const zone = invoiceZone(details.business);
    const who = billedTo(i).name;
    const readOnlyId = useId();
    // The note that says why a card button is off, read with the button.
    const whyId = useId();
    const run = useDetailsActions({ details, onChanged, onGone, print });
    const { actions, does } = run;

    const owed =
        (i.standing === "ISSUED" || i.standing === "OVERDUE") &&
        i.kind !== "CREDIT_NOTE" &&
        !i.order;
    const nextReminderAt = i.send?.nextReminderAt ?? null;
    // A reminder went today, by email or WhatsApp, so the next waits: said
    // whenever a button is off for it, even with no email to send by (a
    // WhatsApp reminder turns Share on WhatsApp off, 20 Oct).
    const reminderWaits =
        nextReminderAt !== null &&
        ((run.sendable && wasSent(i.sent)) ||
            [actions.main, ...actions.beside].some(
                (a) => a?.disabled && a.reason === REMINDED_TODAY,
            ));
    // One note under the money, never a stack (owner, 13 Oct): the first
    // that applies. The rest is said on the buttons it is about.
    const note: ReactNode = run.charging ? (
        <span id={whyId}>
            <span className="font-semibold text-foreground">
                Autopay charge in progress ·{" "}
                <ViewerDate iso={run.charging.at} />
            </span>
            . The payment link and reminders are held until {who}&apos;s bank
            answers, so they&apos;re never charged twice.
        </span>
    ) : owed && reminderWaits && nextReminderAt ? (
        <span id={whyId}>
            {NEXT_REMINDER_AFTER}{" "}
            <ViewerDate iso={nextReminderAt} variant="datetime" />.
        </span>
    ) : owed && !run.linkBox && !run.payOnline ? (
        <OfflinePayHint
            blocker={i.online?.onlineBlocker ?? null}
            paymentsOn={details.paymentsOn}
            providerConnected={i.online?.providerConnected ?? false}
            canWrite={can.write}
            who={who}
        />
    ) : owed && !run.linkBox && i.online?.payLinkActive ? (
        <UnseenLinkNote
            sendable={run.sendable}
            madeAt={i.online.payLinkMadeAt}
        />
    ) : null;
    // Why it can't be emailed, with the way to fix it (DEC-011, DEC-091):
    // the card's own last line, as INVPageA draws it, unless autopay holds
    // everything anyway.
    const emailLine: ReactNode =
        owed &&
        can.write &&
        !run.charging &&
        i.send?.reason === "NO_EMAIL_PROVIDER" ? (
            <EmailNoteText
                note={
                    details.emailNote ?? {
                        text: INVOICE_EMAIL_WORDS.connect,
                        action: null,
                    }
                }
            />
        ) : null;

    const pill = headerPill(i);
    const badge = (
        <StatusBadge tone={pill.variant} size="default">
            {pill.label}
        </StatusBadge>
    );
    const issued = i.issuedAt ? (
        <>
            issued{" "}
            <ViewerDate iso={i.issuedAt} variant="dayMonth" timeZone={zone} />
        </>
    ) : (
        "not issued yet"
    );

    const moneyCard = (
        <MoneyCard
            message={moneyMessage(i, { timeZone: zone })}
            actions={actions}
            does={does}
            note={note}
            foot={emailLine}
            extra={run.linkBox}
            describedBy={can.write ? whyId : readOnlyId}
        />
    );
    const readOnly = !can.write ? (
        <ReadOnlyNote id={readOnlyId} className="mb-0 print:hidden">
            {[actions.main, ...actions.beside].find((a) => a?.reason)?.reason ??
                "Your role can read this invoice but not change it."}
        </ReadOnlyNote>
    ) : null;
    const side = (
        <>
            <DetailsHistory
                invoice={i}
                canWrite={can.write}
                timeZone={zone}
                onRemove={run.removePayment}
                onBounce={run.bouncePayment}
            />
            <ConnectedPanel invoice={i} others={details.others} />
            {i.online ? (
                <PaymentsToRefund
                    payments={i.online.payments}
                    invoiceStatus={i.status}
                />
            ) : null}
        </>
    );
    const paper = (
        <InvoicePaper
            invoice={i}
            business={details.business}
            businessName={details.businessName}
        />
    );
    const menus = (place: MenuPlace) => (
        <ShareAndMore
            actions={actions}
            does={does}
            align={place.align}
            side={place.side}
            className="print:hidden"
        />
    );

    if (layout === "sheet") {
        const bar = menus({ align: "start", side: "top" });
        return (
            <div className="grid gap-3" data-invoice-sheet>
                {readOnly}
                {moneyCard}
                {side}
                <section aria-label="The invoice" className="grid gap-1.5">
                    <h3 className="label print:hidden">The invoice</h3>
                    {paper}
                </section>
                <SheetFoot>{foot ? foot(bar) : bar}</SheetFoot>
                {run.overlays}
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                holdsData
                className="mb-4 print:hidden"
                breadcrumb={[
                    "Payments",
                    <Link key="list" href="/billing/invoices">
                        Invoices
                    </Link>,
                    i.number ?? "Draft",
                ]}
                // A number is a measured value: the mono face, at the
                // title's size.
                title={
                    <span className="font-mono font-medium">
                        {i.number ?? "Draft"}
                    </span>
                }
                badge={badge}
                description={
                    <>
                        {who} · {sourceLine(i)} · {issued}
                    </>
                }
                actions={menus({ align: "end" })}
            />
            {readOnly ? <div className="mb-3.5">{readOnly}</div> : null}
            <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-[3_1_460px]">{paper}</div>
                <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-3 max-md:-order-1 print:hidden">
                    {moneyCard}
                    {side}
                </div>
            </div>
            {run.overlays}
        </div>
    );
}

/**
 * The sheet's foot, held to the bottom of its scrolling body: Share, More,
 * Previous and Next stay within a thumb's reach however far it scrolls.
 */
export function SheetFoot({ children }: { children: ReactNode }) {
    return (
        <div
            data-sheet-foot
            className="sticky -bottom-4 z-10 -mx-[18px] -mb-4 mt-1 flex flex-wrap items-center gap-2 border-t border-border bg-card px-[18px] py-3 pb-[max(12px,env(safe-area-inset-bottom))] print:hidden"
        >
            {children}
        </div>
    );
}
