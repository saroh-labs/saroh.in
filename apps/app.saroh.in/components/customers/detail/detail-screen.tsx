"use client";

import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
    restoreOffersAction,
    stopOffersAction,
} from "@/lib/customer-workspace/actions";
import type { CustomerDetail } from "@/lib/customer-workspace/detail";
import { shownDuplicates } from "@/lib/customer-workspace/merge";
import { pageMissing } from "@/lib/customer-workspace/packs";
import type {
    DuplicateSuggestion,
    IdentitySuggestion,
} from "@/lib/customer-workspace/service";
import { signsInLine } from "@/lib/customer-workspace/site-account";
import type {
    OrderFilter,
    ReviewsRead,
    TabKey,
    ThreadRead,
} from "@/lib/customer-workspace/view";
import {
    canStopOffers,
    crumbsUnderSell,
    initials,
    kindOf,
    owedLine,
    sinceLine,
    tabsFor,
    tagFor,
} from "@/lib/customer-workspace/view";

import {
    AttentionCard,
    AttentionEditor,
    HeaderAttention,
    useAttention,
} from "./attention";
import { AttentionSuggestions } from "./attention-suggestions";
import { InvoicesTab, SubscriptionsTab } from "./billing-tabs";
import { BookingsTab } from "./bookings-tab";
import { Crumbs, Header, Tabs } from "./header";
import { MessagesTab } from "./messages-tab";
import { useMoreActions } from "./more-actions";
import { Notes } from "./notes";
import { DuplicateNotice, PartialNotice, PossibleMatch } from "./notices";
import { OrdersTab } from "./orders-tab";
import { Overview } from "./overview";
import type { PackSale } from "./packs-tab";
import { useCustomerPacks } from "./packs-tab";
import { Failed } from "./parts";
import { ReviewsTab } from "./reviews-tab";

/**
 * Customer Detail (plan 2026-09-23-003, U18), after "Saroh Customer Detail":
 * who they are, then tabs by business kind — a shop's Orders, Subscriptions
 * and Invoices; a bookings business's Bookings, Membership and Invoices —
 * and the notes the team keeps. Rendered from one read rooted on the contact.
 *
 * The tab lives in the address (`?tab=`), changed in place so switching is
 * instant and a link opens the same tab.
 */
export function CustomerDetailScreen({
    d,
    initialTab,
    bizName,
    sells,
    canWrite,
    canMerge,
    canRemove = false,
    canConsent,
    canSensitive,
    sensitiveRoles = null,
    userId,
    suggestions,
    duplicates,
    thread = null,
    reviews = null,
    canReplyReviews = false,
    packSale = null,
    canExtendPacks = false,
    nowIso,
}: {
    d: CustomerDetail;
    initialTab: TabKey;
    bizName: string | null;
    /** The business sells (Commerce on): the crumbs say Sell › Customers. */
    sells: boolean;
    /** `contact:write`: edit, link, delete, add notes. */
    canWrite: boolean;
    /** `customer:merge`: merge with a duplicate (C10). */
    canMerge: boolean;
    /** `customer:remove`: remove their details for a privacy request (C11). */
    canRemove?: boolean;
    /** `consent:write`: record that they asked to stop. */
    canConsent: boolean;
    /** `customer:sensitive`: may mark a Needs attention note sensitive. */
    canSensitive: boolean;
    /**
     * The roles whose people can read a sensitive note (C12's tick,
     * DEC-073); null when they couldn't be read.
     */
    sensitiveRoles?: string[] | null;
    userId: string | null;
    suggestions: IdentitySuggestion[];
    /** Other records that look like the same person (C2). */
    duplicates: DuplicateSuggestion[];
    /** Their message thread (A13), for the Messages tab. */
    thread?: ThreadRead;
    /** Their product reviews (C6), for the Reviews tab. */
    reviews?: ReviewsRead;
    /** `product-review:write`: reply to and hide a review. */
    canReplyReviews?: boolean;
    /** Selling them a pack (C7); null when this viewer may not. */
    packSale?: PackSale | null;
    /** `pack:write`: give one of their packs more days (E16). */
    canExtendPacks?: boolean;
    nowIso: string;
}) {
    const router = useRouter();
    const now = new Date(nowIso);
    const kind = kindOf(d);
    const tabs = tabsFor(d, thread, reviews);
    const [tab, setTab] = useState<TabKey>(initialTab);
    const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
    const [stopping, setStopping] = useState(false);
    const attention = useAttention({
        contactId: d.contact.id,
        attention: d.attention,
    });
    const name = d.contact.name;
    // Edit details and ⋯ More actions, and what each opens (C14).
    const more = useMoreActions({
        d,
        name,
        sells,
        canWrite,
        canMerge,
        canRemove,
        suggestions,
        duplicates,
    });
    const first = d.contact.firstName?.trim()
        ? d.contact.firstName.trim()
        : (name.split(" ")[0] ?? name);
    // Their packs (C7): the tab, and selling and extending from here.
    const packs = useCustomerPacks({
        d,
        sale: packSale,
        canExtend: canExtendPacks,
        first,
        nowIso,
    });

    const go = (key: TabKey) => {
        setTab(key);
        const url = new URL(window.location.href);
        if (key === "over") url.searchParams.delete("tab");
        else url.searchParams.set("tab", key);
        window.history.replaceState(null, "", url.pathname + url.search);
    };

    async function stop() {
        setStopping(true);
        const res = await stopOffersAction(d.contact.id);
        setStopping(false);
        if (!res.ok) return showError(res.error);
        router.refresh();
        const said = `Recorded: no more offers to ${name}.`;
        // Undo puts back the yes they gave; with no yes on record there is
        // nothing to put back, and inventing one would be a false consent.
        if (d.consent?.status !== "GRANTED") return showSuccess(said);
        showUndo(said, () => {
            void restoreOffersAction(d.contact.id).then((back) => {
                if (!back.ok) showError(back.error);
                router.refresh();
            });
        });
    }

    const panel = () => {
        switch (tab) {
            case "ord":
                return d.orders ? (
                    <OrdersTab
                        rows={d.orders.rows}
                        count={d.stats.orders ?? d.orders.rows.length}
                        filter={orderFilter}
                        onFilter={setOrderFilter}
                        timeZone={d.timezone}
                        now={now}
                    />
                ) : (
                    <Failed what="Orders" />
                );
            case "bk":
                return d.bookings ? (
                    <BookingsTab bookings={d.bookings} now={now} />
                ) : (
                    <Failed what="Bookings" />
                );
            case "pk":
                return packs.tab;
            case "sub":
                return d.subscriptions ? (
                    <SubscriptionsTab
                        rows={d.subscriptions.rows}
                        kind={kind}
                        timeZone={d.timezone}
                        now={now}
                    />
                ) : (
                    <Failed
                        what={
                            kind === "bookings" ? "Membership" : "Subscriptions"
                        }
                    />
                );
            case "inv":
                return d.invoices ? (
                    <InvoicesTab
                        rows={d.invoices.rows}
                        owed={owedLine(d)}
                        kind={kind}
                        timeZone={d.timezone}
                        now={now}
                    />
                ) : (
                    <Failed what="Invoices" />
                );
            case "rev":
                return reviews && reviews !== "failed" ? (
                    <ReviewsTab
                        reviews={reviews}
                        firstName={first}
                        canReply={canReplyReviews}
                    />
                ) : (
                    <Failed what="Reviews" />
                );
            case "msg":
                return thread && thread !== "failed" ? (
                    <MessagesTab
                        contactId={d.contact.id}
                        thread={thread}
                        firstName={first}
                        timeZone={d.timezone}
                        now={now}
                    />
                ) : (
                    <Failed what="Messages" />
                );
            case "notes":
                return d.notes ? (
                    <Notes
                        contactId={d.contact.id}
                        rows={d.notes.rows}
                        canWrite={canWrite}
                        userId={userId}
                        timeZone={d.timezone}
                        now={now}
                    />
                ) : (
                    <Failed what="Notes" />
                );
            default:
                return (
                    <Overview
                        d={d}
                        attention={
                            d.attention !== undefined ? (
                                <AttentionCard
                                    state={attention}
                                    canWrite={canWrite}
                                    userId={userId}
                                    timeZone={d.timezone}
                                    now={now}
                                />
                            ) : null
                        }
                        now={now}
                        canStop={canStopOffers(d.consent)}
                        stopping={stopping}
                        canConsent={canConsent}
                        onStop={() => void stop()}
                        onOrders={(f) => {
                            setOrderFilter(f);
                            go("ord");
                        }}
                        onBookings={() => go("bk")}
                        onSellPack={packs.onSell}
                    />
                );
        }
    };

    return (
        <>
            <div className="px-[26px] pt-5">
                <Crumbs here={name} sells={crumbsUnderSell(sells, d)} />
                <Header
                    name={name}
                    initials={initials(name)}
                    tag={tagFor(d)}
                    since={sinceLine(d, bizName, now)}
                    email={d.contact.email}
                    phone={d.contact.phone}
                    signsIn={
                        d.siteAccount ? signsInLine(d.siteAccount, true) : null
                    }
                    attention={<HeaderAttention state={attention} />}
                    canEdit={canWrite}
                    canMore={canWrite || canMerge || canRemove}
                    onEdit={more.edit}
                    menu={more.menu}
                />
                <DuplicateNotice
                    // A same email is offered to whoever edits contacts
                    // (DEC-097); a phone pair as before (C2).
                    duplicates={shownDuplicates(duplicates, {
                        canEdit: canWrite,
                    })}
                    onMerge={more.mergeDuplicate}
                />
                {canWrite && d.attention?.suggestions?.length ? (
                    <AttentionSuggestions
                        contactId={d.contact.id}
                        suggestions={d.attention.suggestions}
                        choices={d.notes?.allergenChoices ?? []}
                        name={name}
                        sensitiveRoles={sensitiveRoles}
                        timeZone={d.timezone}
                        now={now}
                        canSensitive={canSensitive}
                    />
                ) : null}
                <Tabs tabs={tabs} value={tab} onChange={go} />
            </div>
            <div
                id={`panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`tab-${tab}`}
                className="px-[26px] pb-[30px] pt-5"
            >
                <PartialNotice first={first} missing={pageMissing(d)} />
                {tab === "over" || tab === "ord" ? (
                    <PossibleMatch
                        matches={d.possibleMatches ?? []}
                        canLink={canWrite}
                        onLink={more.link}
                    />
                ) : null}
                {panel()}
            </div>

            {more.dialogs}
            {packs.dialogs}
            {canWrite ? (
                <AttentionEditor
                    state={attention}
                    contactId={d.contact.id}
                    choices={d.notes?.allergenChoices ?? []}
                    canSensitive={canSensitive}
                />
            ) : null}
        </>
    );
}
