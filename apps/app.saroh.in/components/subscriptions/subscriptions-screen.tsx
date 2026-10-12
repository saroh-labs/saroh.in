"use client";

import { formatMoneyMajor } from "@/lib/format/money";
import { plural } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { countLabel, PageHeader } from "@saroh/ui/page-header";
import { useLocalPages } from "@saroh/ui/page-sizes";
import { Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LimitNoticeBlock } from "@/components/billing/limit-notice";
import type { ContactOption } from "@/components/shared/contact-picker";
import {
    ListFilter,
    ListTable,
    listTable,
    ListTableHead,
    ListToolbar,
} from "@/components/shared/list-toolbar";
import type { OnlinePaymentsLock } from "@/lib/billing/access";
import type { MissingRates } from "@/lib/gst-rates/missing";
import { LIST_LIMIT } from "@/lib/lists/capped";
import { plansOnTab } from "@/lib/subscriptions/plan-cards";
import type {
    Optional,
    Plan,
    Subscription,
    SubscriptionCharge,
    SubscriptionSettings,
} from "@/lib/subscriptions/service";
import type { ListTab, ScreenTab } from "@/lib/subscriptions/view";
import { listTab, monthlyTotal, TAB_LABEL } from "@/lib/subscriptions/view";

import { Notice } from "@saroh/ui/notice";
import { TabStrip } from "@saroh/ui/tabs";
import { PlansTab } from "./plans-tab";
import { SubscribeDialog } from "./subscribe-dialog";
import { SubscriptionQuickLook } from "./subscription-quick-look";
import {
    SUBSCRIPTION_COLS,
    SUBSCRIPTION_ROW,
    SubscriptionRow,
} from "./subscription-row";

const TABS: ListTab[] = ["active", "failed", "paused", "cancelled"];
const SEARCH_FROM = 8;

/**
 * Payments → Subscriptions, after "Saroh Subscriptions": who is on which
 * plan, sorted by where each stands (Active / Payment failed / Paused /
 * Cancelled). A row opens a quick look; every change happens on the
 * subscription's own page, which the quick look opens with the step ready.
 * The last tab is Plans (D3): what is sold, one card each.
 *
 * `now` comes from the server, so the words a row says are the same when
 * the page is drawn and when it hydrates.
 */
export function SubscriptionsScreen({
    subscriptions,
    truncated = false,
    plans: planRead,
    showClasses,
    contacts,
    charges,
    renewNote,
    canWrite,
    initialTab,
    openSubscribe,
    subscribePlanId,
    nowIso,
    settings = null,
    autopayOffered = false,
    newLocked = null,
    plansLocked = null,
    missingRates = null,
}: {
    /**
     * What is on sale with a price and no GST rate, for the Plans tab's
     * notice; null when it couldn't be told, which draws nothing.
     */
    missingRates?: MissingRates | null;
    subscriptions: Subscription[];
    /** The newest read hit its cap: older cancelled ones are not here. */
    truncated?: boolean;
    /** Null when the plans couldn't be read: the Plans tab says so. */
    plans: Plan[] | null;
    /** Whether plan cards say their classes (Appointments on). */
    showClasses: boolean;
    contacts: ContactOption[];
    /** Each subscription's invoices, for the quick look's last charges. */
    charges: Optional<Record<string, SubscriptionCharge[]>>;
    /** "Renewals last ran …", and whether that is late; null when unknown. */
    renewNote: { text: string; late: boolean } | null;
    canWrite: boolean;
    initialTab: ScreenTab;
    /** `?subscribe=1`, from the command menu or a plan's page. */
    openSubscribe?: boolean;
    /** `&plan=…`: the plan the dialog opens on (UX-080). */
    subscribePlanId?: string;
    nowIso: string;
    /** "Members can pause from their account" (A8); null when unread. */
    settings?: SubscriptionSettings | null;
    /** The business offers autopay (D14): the copy may say so. */
    autopayOffered?: boolean;
    /**
     * The plan starts no new membership (rows `subscriptions`, `payments`):
     * its notice instead of "Subscribe someone". Those already on a plan
     * keep renewing.
     */
    newLocked?: OnlinePaymentsLock | null;
    /**
     * The plan sets up no membership plan (6 Oct 2026): the Plans tab says
     * so in place of "New plan", and its own notice replaces the one above.
     */
    plansLocked?: OnlinePaymentsLock | null;
}) {
    const router = useRouter();
    const now = new Date(nowIso);
    const [tab, setTab] = useState<ScreenTab>(initialTab);
    const [query, setQuery] = useState("");
    const [peekId, setPeekId] = useState<string | null>(null);
    const [subscribing, setSubscribing] = useState(Boolean(openSubscribe));

    /** Drop `?subscribe=1` on close, so a refresh or Back doesn't reopen it. */
    function onSubscribeOpenChange(open: boolean) {
        setSubscribing(open);
        if (open || !openSubscribe) return;
        const url = new URL(window.location.href);
        url.searchParams.delete("subscribe");
        url.searchParams.delete("plan");
        router.replace(url.pathname + url.search, { scroll: false });
    }

    /** The tab is in the address, so Back and a shared link land on it. */
    function pick(next: ScreenTab) {
        setTab(next);
        setPeekId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("view");
        if (next === "active") url.searchParams.delete("tab");
        else url.searchParams.set("tab", next);
        window.history.replaceState(null, "", url.pathname + url.search);
    }

    const count = (t: ListTab) =>
        subscriptions.filter((s) => listTab(s) === t).length;
    const failed = count("failed");
    const needle = query.trim().toLowerCase();
    const rows = subscriptions.filter(
        (s) =>
            listTab(s) === tab &&
            (!needle ||
                s.contact.name.toLowerCase().includes(needle) ||
                s.plan.name.toLowerCase().includes(needle)),
    );
    // A page of them at a time, at the size this list was last shown at.
    const { rows: paged, paging } = useLocalPages("subscriptions", rows, {
        label: "Pages of subscriptions",
        resetOn: `${tab}|${needle}`,
    });
    const running = subscriptions.filter((s) => listTab(s) === "active");
    const total = monthlyTotal(subscriptions);
    const monthly = total
        ? formatMoneyMajor(total.amount, total.currency)
        : null;
    const plans = planRead ?? [];
    const onPlans = tab === "plans";
    const peek = subscriptions.find((s) => s.id === peekId) ?? null;
    // Subscribing someone new, where the plan allows it.
    const canSubscribe = canWrite && !newLocked;

    return (
        <>
            <div>
                <PageHeader
                    className="mb-1.5"
                    breadcrumb={["Payments", "Subscriptions"]}
                    title="Subscriptions"
                    count={countLabel(subscriptions.length, {
                        one: "subscription",
                        other: "subscriptions",
                    })}
                    // A summary, not a count of the list: before the button.
                    meta={
                        subscriptions.length > 0 ? (
                            <span>
                                {running.length} active
                                {monthly ? ` · about ${monthly} a month` : ""}
                            </span>
                        ) : undefined
                    }
                    actions={
                        canSubscribe ? (
                            <Button onClick={() => setSubscribing(true)}>
                                Subscribe someone
                            </Button>
                        ) : undefined
                    }
                />
                {/* The Plans tab says its own lock, in its own words. */}
                {newLocked && !(onPlans && plansLocked) ? (
                    <LimitNoticeBlock
                        full={false}
                        title={newLocked.title}
                        body={newLocked.body}
                        cta={newLocked.cta}
                        href={newLocked.href}
                        className="mb-3"
                    />
                ) : null}
                {renewNote ? (
                    <p
                        className={cn(
                            "mb-3 text-[12px]",
                            renewNote.late
                                ? "font-medium text-warning-subtle-foreground"
                                : "text-muted-foreground",
                        )}
                        role={renewNote.late ? "status" : undefined}
                    >
                        {renewNote.text}
                    </p>
                ) : (
                    <div className="mb-3" />
                )}
                {/* Two views: who is subscribed, and the plans on sale.
                    Where each subscription stands (Active, Payment
                    failed, Paused, Cancelled) narrows the one list, so it
                    is a dropdown beside the search, not more tabs. The
                    address keeps `?tab=` for both, as it always has. */}
                <ListToolbar
                    tabs={
                        <TabStrip
                            label="Subscriptions"
                            idPrefix="tab"
                            value={onPlans ? "plans" : "subscribers"}
                            onValueChange={(v) =>
                                pick(v === "plans" ? "plans" : "active")
                            }
                            tabs={[
                                {
                                    value: "subscribers",
                                    label: "Subscribers",
                                    controls: "subscriptions-panel",
                                    count: subscriptions.length,
                                },
                                {
                                    value: "plans",
                                    label: "Plans",
                                    controls: "subscriptions-panel",
                                    // No count when they couldn't be
                                    // read: a 0 would say there are none.
                                    count: planRead
                                        ? plansOnTab(planRead)
                                        : undefined,
                                },
                            ]}
                        />
                    }
                    // Search earns its row only on a list long enough to
                    // need it; a phone has little room to spare.
                    search={
                        !onPlans && subscriptions.length > SEARCH_FROM ? (
                            <ListSearch
                                placeholder="Search subscriptions"
                                describe="By name or plan"
                                defaultValue={query}
                                onSearch={setQuery}
                            />
                        ) : null
                    }
                    onClear={
                        !onPlans && (tab !== "active" || needle)
                            ? () => {
                                  setQuery("");
                                  pick("active");
                              }
                            : undefined
                    }
                    filters={
                        !onPlans && subscriptions.length > 0 ? (
                            <ListFilter<ListTab>
                                label="Subscription status"
                                value={tab}
                                onValueChange={pick}
                                options={TABS.map((t) => ({
                                    value: t,
                                    label: TAB_LABEL[t],
                                    count: count(t),
                                }))}
                            />
                        ) : null
                    }
                />
            </div>
            <div
                id="subscriptions-panel"
                role="tabpanel"
                aria-labelledby={`tab-${onPlans ? "plans" : "subscribers"}`}
                className="pt-4"
            >
                {tab === "plans" ? (
                    <PlansTab
                        plans={planRead}
                        canWrite={canWrite}
                        showClasses={showClasses}
                        settings={settings}
                        nowIso={nowIso}
                        locked={plansLocked}
                        missingRates={missingRates}
                    />
                ) : (
                    <>
                        {failed > 0 && tab !== "failed" ? (
                            <Notice
                                tone="error"
                                className="mb-3.5"
                                align="center"
                            >
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="flex-[1_1_260px] text-[13px] font-semibold text-destructive-subtle-foreground">
                                        {failed}{" "}
                                        {failed === 1
                                            ? "renewal isn't"
                                            : "renewals aren't"}{" "}
                                        paid and{" "}
                                        {plural(failed, "needs", "need")} you.
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-destructive-subtle-foreground"
                                        onClick={() => pick("failed")}
                                    >
                                        Show them
                                    </Button>
                                </div>
                            </Notice>
                        ) : null}
                        {subscriptions.length === 0 ? (
                            <EmptyState
                                icon={<Repeat />}
                                title="No one is subscribed yet"
                                description="Put a customer on a plan and their first invoice goes out straight away."
                                action={
                                    canSubscribe ? (
                                        <Button
                                            onClick={() => setSubscribing(true)}
                                        >
                                            Subscribe someone
                                        </Button>
                                    ) : undefined
                                }
                            />
                        ) : rows.length === 0 ? (
                            needle ? (
                                <EmptyState
                                    kind="no-results"
                                    things={`${TAB_LABEL[tab].toLowerCase()} subscriptions`}
                                    cause="search"
                                    query={query}
                                    onClear={() => setQuery("")}
                                />
                            ) : (
                                <EmptyState
                                    kind="no-results"
                                    things="subscriptions"
                                    cause="view"
                                    icon={<Repeat />}
                                    title={`No ${TAB_LABEL[tab].toLowerCase()} subscriptions`}
                                />
                            )
                        ) : (
                            <ListTable>
                                <ListTableHead
                                    className={cn(
                                        SUBSCRIPTION_ROW,
                                        "max-md:hidden",
                                    )}
                                >
                                    <span className="w-[34px]" />
                                    <span className={SUBSCRIPTION_COLS.who}>
                                        Subscriber
                                    </span>
                                    <span className={SUBSCRIPTION_COLS.status}>
                                        Status
                                    </span>
                                    <span className={SUBSCRIPTION_COLS.when}>
                                        Next
                                    </span>
                                    <span className={SUBSCRIPTION_COLS.price}>
                                        Price
                                    </span>
                                </ListTableHead>
                                <ul aria-label="Subscriptions">
                                    {paged.map((s) => (
                                        <li
                                            key={s.id}
                                            className={listTable.rule}
                                        >
                                            <SubscriptionRow
                                                sub={s}
                                                plans={plans}
                                                now={now}
                                                open={s.id === peekId}
                                                onOpen={() => setPeekId(s.id)}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            </ListTable>
                        )}
                        {rows.length > 0 ? paging : null}
                        {truncated ? (
                            <p className="mt-3 max-w-[68ch] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                                Showing the newest {LIST_LIMIT} subscriptions
                                and every active or paused one. Older cancelled
                                ones are not listed.
                            </p>
                        ) : null}
                    </>
                )}
            </div>

            <SubscriptionQuickLook
                sub={peek}
                onClose={() => setPeekId(null)}
                plans={plans}
                charges={charges}
                canWrite={canWrite}
                now={now}
            />
            {canSubscribe ? (
                <SubscribeDialog
                    open={subscribing}
                    onOpenChange={onSubscribeOpenChange}
                    contacts={contacts}
                    plans={plans}
                    initialPlanId={
                        plans.some(
                            (p) =>
                                p.id === subscribePlanId &&
                                p.status === "ACTIVE",
                        )
                            ? subscribePlanId
                            : undefined
                    }
                    autopayOffered={autopayOffered}
                />
            ) : null}
        </>
    );
}
