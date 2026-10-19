"use client";

import { Avatar, AvatarFallback, avatarInitials } from "@saroh/ui/avatar";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { TabStrip } from "@saroh/ui/tabs";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { RAZORPAY_LINK_HINT } from "@/lib/billing-action-words";
import type { Query } from "@/lib/billing-filters";
import { hrefOf } from "@/lib/billing-filters";
import type { SarohSubscriptionDetail } from "@/lib/billing-words";
import { cycleLabel, istDate, statusLabel } from "@/lib/billing-words";
import type {
    BillingHistoryPage,
    HistoryShow,
    SheetTab,
} from "@/lib/subscription-sheet";
import {
    problemOf,
    SHEET_TAB_LABEL,
    SHEET_TABS,
} from "@/lib/subscription-sheet";

import { RecheckRefund, SyncCustomer } from "./billing-controls";
import { SubscriptionInvoices } from "./subscription-billing";
import { useSubscriptionChanges } from "./subscription-changes";
import { SubscriptionHistory } from "./subscription-history";
import { SubscriptionSummary } from "./subscription-summary";
import { STATUS_TONE } from "./subscription-table";

/**
 * One subscription in a side sheet (admin plan U15, R27), opened from its
 * row (`?open=<id>`). The header names the business, its status and
 * "‹Plan› · ‹cycle› · since ‹date›"; one problem banner leads when there
 * is one, with its fix only where an action today fixes it; then three
 * tabs, each an address (`?sheet=`): Summary (the facts and today's
 * actions), History (one timeline) and Invoices.
 *
 * Every action is an `OperatorDialog` with a reason, behind
 * `saroh-billing:act`. After a write the page is read again (the server
 * action revalidates it), so the sheet shows what changed, and the list's
 * row lights for two seconds (R9). Closing it goes back to the list.
 */
export function SubscriptionSheet({
    detail,
    failed,
    base,
    query,
    tab = "summary",
    history,
    historyShow = "everything",
    canAct = false,
    canViewAs = false,
}: {
    /** Null when the read failed or was refused (`failed` says which). */
    detail: SarohSubscriptionDetail | null;
    failed?: "error" | "refused";
    /** The list's path, and its query with the sheet open in it. */
    base: string;
    query: Query;
    tab?: SheetTab;
    /** The History tab's page; undefined: not read or failed. */
    history?: BillingHistoryPage | null;
    historyShow?: HistoryShow;
    /** Holds `saroh-billing:act`: the actions show. */
    canAct?: boolean;
    /** Holds `organization:view-as`: "Open the business" shows. */
    canViewAs?: boolean;
}) {
    const router = useRouter();
    const changes = useSubscriptionChanges();
    const sub = detail?.subscription;
    const closeHref = hrefOf(base, {
        ...query,
        open: undefined,
        sheet: undefined,
        history: undefined,
        hpage: undefined,
    });
    const sheetHref = (next: SheetTab) =>
        hrefOf(base, {
            ...query,
            sheet: next === "summary" ? undefined : next,
            history: undefined,
            hpage: undefined,
        });
    const historyHref = (show: HistoryShow, page = 1) =>
        hrefOf(base, {
            ...query,
            sheet: "history",
            history: show === "everything" ? undefined : show,
            hpage: page > 1 ? String(page) : undefined,
        });
    const done = (message: string) => {
        if (sub) changes?.report({ message, rowId: sub.id });
    };

    return (
        <Sheet
            open
            onOpenChange={(open) => {
                if (!open) router.push(closeHref, { scroll: false });
            }}
        >
            <SheetContent
                className="w-full overflow-y-auto sm:max-w-2xl"
                closeButton={false}
            >
                <SheetHeader>
                    <div className="flex items-start gap-3">
                        {sub ? (
                            <Avatar size="panel" tone="neutral">
                                <AvatarFallback>
                                    {avatarInitials(sub.organization.name)}
                                </AvatarFallback>
                            </Avatar>
                        ) : null}
                        <div className="grid min-w-0 flex-1 gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <SheetTitle>
                                    {sub
                                        ? sub.organization.name
                                        : "Subscription"}
                                </SheetTitle>
                                {sub ? (
                                    <Badge
                                        variant={
                                            STATUS_TONE[sub.status] ?? "neutral"
                                        }
                                    >
                                        {statusLabel(sub.status)}
                                    </Badge>
                                ) : null}
                            </div>
                            <SheetDescription>
                                {detail && sub
                                    ? `${sub.plan.name} · ${cycleLabel(sub.billingCycle)} · since ${istDate(detail.since)}`
                                    : failed === "refused"
                                      ? "Your access does not cover Saroh's subscriptions."
                                      : "It could not be loaded. Nothing has changed; try again in a moment."}
                            </SheetDescription>
                            {sub && canViewAs ? (
                                <Link
                                    href={`/businesses/${sub.organization.id}`}
                                    className="w-fit text-sm underline underline-offset-4"
                                >
                                    Open the business
                                </Link>
                            ) : null}
                        </div>
                        <SheetClose asChild>
                            <Button type="button" variant="outline" size="sm">
                                Close
                            </Button>
                        </SheetClose>
                    </div>
                </SheetHeader>

                {detail ? (
                    <div className="mt-4 grid gap-4">
                        <ProblemBanner
                            detail={detail}
                            canAct={canAct}
                            onDone={done}
                        />
                        <TabStrip
                            label="Subscription"
                            value={tab}
                            tabs={SHEET_TABS.map((t) => ({
                                value: t,
                                label: SHEET_TAB_LABEL[t],
                                href: sheetHref(t),
                            }))}
                        />
                        {tab === "summary" ? (
                            <SubscriptionSummary
                                detail={detail}
                                canAct={canAct}
                                onDone={done}
                            />
                        ) : tab === "history" ? (
                            <SubscriptionHistory
                                history={history}
                                show={historyShow}
                                href={historyHref}
                            />
                        ) : (
                            <SubscriptionInvoices
                                detail={detail}
                                canAct={canAct}
                                onDone={done}
                            />
                        )}
                        <p className="text-[12px] text-muted-foreground">
                            {RAZORPAY_LINK_HINT}
                        </p>
                    </div>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

/**
 * The one problem, red, with its fix where an action today does it. None
 * for a failed payment: a pay link is not in this round (owner, 18 Oct).
 */
function ProblemBanner({
    detail,
    canAct,
    onDone,
}: {
    detail: SarohSubscriptionDetail;
    canAct: boolean;
    onDone: (message: string) => void;
}) {
    const problem = problemOf(detail);
    if (!problem) return null;
    const fix = canAct ? problem.fix : null;
    return (
        <Notice
            tone="error"
            title={problem.title}
            action={
                fix?.kind === "sync" ? (
                    <SyncCustomer
                        organizationId={detail.subscription.organization.id}
                        onDone={() =>
                            onDone("Syncing the Razorpay customer again.")
                        }
                    />
                ) : fix?.kind === "recheck" ? (
                    <RecheckRefund
                        providerPaymentId={fix.providerPaymentId}
                        onDone={() =>
                            onDone(
                                `Asked Razorpay again about ${fix.providerPaymentId}.`,
                            )
                        }
                    />
                ) : undefined
            }
        >
            {problem.line}
        </Notice>
    );
}
