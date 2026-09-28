"use client";

import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteContact } from "@/lib/contacts/actions";
import { deletedLine } from "@/lib/contacts/removal";
import {
    restoreOffersAction,
    stopOffersAction,
    unlinkAccountAction,
    unlinkPreviewAction,
} from "@/lib/customer-workspace/actions";
import type { CustomerDetail } from "@/lib/customer-workspace/detail";
import type { MergeTarget } from "@/lib/customer-workspace/merge";
import { clashTarget, suggestedTarget } from "@/lib/customer-workspace/merge";
import { moreMenu } from "@/lib/customer-workspace/more-menu";
import type {
    DuplicateSuggestion,
    IdentitySuggestion,
} from "@/lib/customer-workspace/service";
import type { UnlinkPreview } from "@/lib/customer-workspace/site-account";
import {
    signsInLine,
    unlinkConfirm,
    unlinkedLine,
} from "@/lib/customer-workspace/site-account";
import type {
    OrderFilter,
    TabKey,
    ThreadRead,
} from "@/lib/customer-workspace/view";
import {
    canStopOffers,
    initials,
    kindOf,
    owedLine,
    sinceLine,
    tabsFor,
    tagFor,
} from "@/lib/customer-workspace/view";

import { IdentityLinkDialog } from "../identity-link-dialog";
import {
    AttentionCard,
    AttentionEditor,
    HeaderAttention,
    useAttention,
} from "./attention";
import { AttentionSuggestions } from "./attention-suggestions";
import { InvoicesTab, SubscriptionsTab } from "./billing-tabs";
import { BookingsTab } from "./bookings-tab";
import { EditSheet } from "./edit-sheet";
import { Crumbs, Header, Tabs } from "./header";
import { MergeDialog } from "./merge-dialog";
import { MessagesTab } from "./messages-tab";
import { Notes } from "./notes";
import { DuplicateNotice, PartialNotice, PossibleMatch } from "./notices";
import { OrdersTab } from "./orders-tab";
import { Overview } from "./overview";
import { Failed } from "./parts";

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
    canConsent,
    userId,
    suggestions,
    duplicates,
    thread = null,
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
    /** `consent:write`: record that they asked to stop. */
    canConsent: boolean;
    userId: string | null;
    suggestions: IdentitySuggestion[];
    /** Other records that look like the same person (C2). */
    duplicates: DuplicateSuggestion[];
    /** Their message thread (A13), for the Messages tab. */
    thread?: ThreadRead;
    nowIso: string;
}) {
    const router = useRouter();
    const now = new Date(nowIso);
    const kind = kindOf(d);
    const tabs = tabsFor(d, thread);
    const [tab, setTab] = useState<TabKey>(initialTab);
    const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
    const [editing, setEditing] = useState(0);
    const [linking, setLinking] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [notThem, setNotThem] = useState<UnlinkPreview | null>(null);
    // The merge (C10): with the other record known, or null to search.
    // Offered only with `customer:merge`.
    const [merging, setMerging] = useState<{
        target: MergeTarget | null;
    } | null>(null);
    const mergeWith = (target: MergeTarget | null) => setMerging({ target });
    const mergeDuplicate = canMerge
        ? (dup: DuplicateSuggestion) => mergeWith(suggestedTarget(dup))
        : undefined;
    const attention = useAttention({
        contactId: d.contact.id,
        attention: d.attention,
    });
    const name = d.contact.name;
    const first = d.contact.firstName?.trim()
        ? d.contact.firstName.trim()
        : (name.split(" ")[0] ?? name);

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

    // "This isn't them" (A4): read what would move, then ask.
    async function askNotThem() {
        const res = await unlinkPreviewAction(d.contact.id);
        if (!res.ok) return showError(res.error);
        setNotThem(res.data);
    }

    async function separate(preview: UnlinkPreview) {
        setNotThem(null);
        const res = await unlinkAccountAction(d.contact.id);
        if (!res.ok) return showError(res.error);
        showSuccess(unlinkedLine(preview.email));
        router.refresh();
    }

    async function remove() {
        setRemoving(false);
        const res = await deleteContact(d.contact.id);
        if (!res.ok) return showError(res.error);
        showSuccess(deletedLine(name, res.data));
        router.push(sells ? "/commerce/customers" : "/contacts");
    }

    const menu = moreMenu(
        {
            canWrite,
            canMerge,
            canLink: d.linkedCustomers !== undefined,
            canUnlink: !!d.siteAccount?.canUnlink,
        },
        {
            merge: () => mergeWith(null),
            link: () => setLinking(true),
            notThem: () => void askNotThem(),
            remove: () => setRemoving(true),
        },
    );

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
                        choices={d.notes.allergenChoices}
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
                    />
                );
        }
    };

    return (
        <>
            <div className="px-[26px] pt-5">
                <Crumbs here={name} sells={sells} />
                <Header
                    name={name}
                    initials={initials(name)}
                    tag={tagFor(d)}
                    since={sinceLine(d, bizName, now)}
                    email={d.contact.email}
                    phone={d.contact.phone}
                    signsIn={
                        d.siteAccount
                            ? signsInLine(d.siteAccount, canWrite)
                            : null
                    }
                    attention={<HeaderAttention state={attention} />}
                    canEdit={canWrite}
                    canMore={canWrite || canMerge}
                    onEdit={() => setEditing((n) => n + 1)}
                    menu={menu}
                />
                <DuplicateNotice
                    duplicates={duplicates}
                    onMerge={mergeDuplicate}
                />
                {canWrite && d.attention?.suggestions?.length ? (
                    <AttentionSuggestions
                        contactId={d.contact.id}
                        suggestions={d.attention.suggestions}
                        choices={d.notes?.allergenChoices ?? []}
                        firstName={first}
                        timeZone={d.timezone}
                        now={now}
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
                <PartialNotice
                    first={first}
                    missing={d.unavailable.map((u) => u.label)}
                />
                {tab === "over" || tab === "ord" ? (
                    <PossibleMatch
                        matches={d.possibleMatches ?? []}
                        canLink={canWrite}
                        onLink={() => setLinking(true)}
                    />
                ) : null}
                {panel()}
            </div>

            {editing ? (
                <EditSheet
                    key={editing}
                    open
                    onOpenChange={(o) => (o ? null : setEditing(0))}
                    contact={d.contact}
                    signsInWith={d.siteAccount?.email ?? null}
                    onMerge={
                        canMerge
                            ? (holder) => mergeWith(clashTarget(holder))
                            : undefined
                    }
                />
            ) : null}
            {merging ? (
                <MergeDialog
                    hereId={d.contact.id}
                    target={merging.target}
                    open
                    onOpenChange={(o) => (o ? null : setMerging(null))}
                />
            ) : null}
            {canWrite ? (
                <AttentionEditor
                    state={attention}
                    contactId={d.contact.id}
                    choices={d.notes?.allergenChoices ?? []}
                />
            ) : null}
            {canWrite ? (
                <IdentityLinkDialog
                    contactId={d.contact.id}
                    suggestions={suggestions}
                    duplicates={duplicates}
                    onMerge={mergeDuplicate}
                    open={linking}
                    onOpenChange={setLinking}
                />
            ) : null}
            {notThem ? (
                <ConfirmDialog
                    open
                    onOpenChange={(o) => (o ? null : setNotThem(null))}
                    {...unlinkConfirm(name, notThem)}
                    confirmLabel="Separate them"
                    cancelLabel="Keep them together"
                    icon={Unlink}
                    onConfirm={() => void separate(notThem)}
                />
            ) : null}
            <ConfirmDialog
                open={removing}
                onOpenChange={setRemoving}
                title={`Delete ${name}?`}
                description={`Their notes, leads, subscriptions and class packs go with them, and future classes paid with those packs are cancelled. Orders, bookings and invoices stay on record under the name they gave, and a store customer with the same email is kept. This cannot be undone.`}
                confirmLabel="Delete record"
                cancelLabel="Keep them"
                onConfirm={() => void remove()}
            />
        </>
    );
}
