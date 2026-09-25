"use client";

import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteContact } from "@/lib/contacts/actions";
import { deletedLine } from "@/lib/contacts/removal";
import {
    restoreOffersAction,
    stopOffersAction,
} from "@/lib/customer-workspace/actions";
import type { CustomerDetail } from "@/lib/customer-workspace/detail";
import type { IdentitySuggestion } from "@/lib/customer-workspace/service";
import type { OrderFilter, TabKey } from "@/lib/customer-workspace/view";
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
import { InvoicesTab, SubscriptionsTab } from "./billing-tabs";
import { BookingsTab } from "./bookings-tab";
import { EditSheet } from "./edit-sheet";
import { Crumbs, Header, Tabs } from "./header";
import { Notes } from "./notes";
import { PartialNotice, PossibleMatch } from "./notices";
import { OrdersTab } from "./orders-tab";
import { Overview } from "./overview";
import { Empty } from "./parts";

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
    canConsent,
    userId,
    suggestions,
    nowIso,
}: {
    d: CustomerDetail;
    initialTab: TabKey;
    bizName: string | null;
    /** The business sells (Commerce on): the crumbs say Sell › Customers. */
    sells: boolean;
    /** `contact:write`: edit, link, delete, add notes. */
    canWrite: boolean;
    /** `consent:write`: record that they asked to stop. */
    canConsent: boolean;
    userId: string | null;
    suggestions: IdentitySuggestion[];
    nowIso: string;
}) {
    const router = useRouter();
    const now = new Date(nowIso);
    const kind = kindOf(d);
    const tabs = tabsFor(d);
    const [tab, setTab] = useState<TabKey>(initialTab);
    const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
    const [editing, setEditing] = useState(0);
    const [linking, setLinking] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [stopping, setStopping] = useState(false);
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

    async function remove() {
        setRemoving(false);
        const res = await deleteContact(d.contact.id);
        if (!res.ok) return showError(res.error);
        showSuccess(deletedLine(name, res.data));
        router.push(sells ? "/commerce/customers" : "/contacts");
    }

    // Drawn for every role, disabled with its reason for one that may not.
    const menu = [
        ...(d.linkedCustomers !== undefined
            ? [
                  {
                      label: "Link a store customer…",
                      go: () => setLinking(true),
                  },
              ]
            : []),
        {
            label: "Delete their record…",
            danger: true,
            go: () => setRemoving(true),
        },
    ];

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
                    canEdit={canWrite}
                    onEdit={() => setEditing((n) => n + 1)}
                    menu={menu}
                />
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
                    contactId={d.contact.id}
                    email={d.contact.email}
                    initial={{
                        firstName: d.contact.firstName ?? "",
                        lastName: d.contact.lastName ?? "",
                        phone: d.contact.phone ?? "",
                        company: d.contact.company ?? "",
                    }}
                />
            ) : null}
            {canWrite ? (
                <IdentityLinkDialog
                    contactId={d.contact.id}
                    suggestions={suggestions}
                    open={linking}
                    onOpenChange={setLinking}
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

function Failed({ what }: { what: string }) {
    return (
        <Empty title={`${what} couldn't be read`}>
            The connection dropped while we were fetching them. Nothing has
            changed — try again in a minute.
        </Empty>
    );
}
