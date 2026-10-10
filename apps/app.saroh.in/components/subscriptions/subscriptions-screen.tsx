"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LimitNoticeBlock } from "@/components/billing/limit-notice";
import type { ContactOption } from "@/components/shared/contact-picker";
import type { OnlinePaymentsLock } from "@/lib/billing/access";
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
import {
    listTab,
    money,
    monthlyTotal,
    TAB_LABEL,
} from "@/lib/subscriptions/view";

import { Notice } from "@saroh/ui/notice";
import { TabStrip } from "@saroh/ui/tabs";
import { PaymentsCrumbs } from "./payments-crumbs";
import { PlansTab } from "./plans-tab";
import { SubscribeDialog } from "./subscribe-dialog";
import { SubscriptionQuickLook } from "./subscription-quick-look";
import { SubscriptionRow } from "./subscription-row";

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
}: {
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
    const running = subscriptions.filter((s) => listTab(s) === "active");
    const total = monthlyTotal(subscriptions);
    const monthly = total ? money(total.amount, total.currency) : null;
    const plans = planRead ?? [];
    const onPlans = tab === "plans";
    const peek = subscriptions.find((s) => s.id === peekId) ?? null;
    // Subscribing someone new, where the plan allows it.
    const canSubscribe = canWrite && !newLocked;

    return (
        <>
            <PaymentsCrumbs here="Subscriptions" />
            <div className="px-6 pt-5">
                <div className="mb-1.5 flex flex-wrap items-center gap-3">
                    <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.03em]">
                        Subscriptions
                    </h1>
                    <span className="ml-auto text-[12.5px] text-muted-foreground">
                        {running.length} active
                        {monthly ? ` · about ${monthly} a month` : ""}
                    </span>
                    {canSubscribe ? (
                        <Button
                            className="h-[38px] rounded-[9px] px-4 text-[14px] font-semibold"
                            onClick={() => setSubscribing(true)}
                        >
                            Subscribe someone
                        </Button>
                    ) : null}
                </div>
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
                <TabStrip
                    label="Subscriptions"
                    idPrefix="tab"
                    value={tab}
                    onValueChange={pick}
                    tabs={[
                        ...TABS.map((t) => ({
                            value: t,
                            label: TAB_LABEL[t],
                            controls: "subscriptions-panel",
                            count: count(t),
                            countTone:
                                t === "failed" && count(t) > 0
                                    ? ("danger" as const)
                                    : ("neutral" as const),
                        })),
                        {
                            value: "plans",
                            label: "Plans",
                            controls: "subscriptions-panel",
                            // No count when they couldn't be read: a 0
                            // would say there are none.
                            count: planRead ? plansOnTab(planRead) : undefined,
                        },
                    ]}
                />
                {/* Search earns its row only on a list long enough to
                    need it; a phone has little room to spare. */}
                {!onPlans && subscriptions.length > SEARCH_FROM ? (
                    <ListSearch
                        placeholder="Search subscriptions by name or plan"
                        defaultValue={query}
                        onSearch={setQuery}
                        className="mt-3"
                    />
                ) : null}
            </div>
            <div
                id="subscriptions-panel"
                role="tabpanel"
                aria-labelledby={`tab-${tab}`}
                className="px-6 pb-[26px] pt-4"
            >
                {tab === "plans" ? (
                    <PlansTab
                        plans={planRead}
                        canWrite={canWrite}
                        showClasses={showClasses}
                        settings={settings}
                        nowIso={nowIso}
                        locked={plansLocked}
                    />
                ) : (
                    <>
                        {failed > 0 && tab !== "failed" ? (
                            <Notice tone="error" className="mb-3.5">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="flex-[1_1_260px] text-[13px] font-semibold text-destructive-subtle-foreground">
                                        {failed}{" "}
                                        {failed === 1
                                            ? "renewal isn't"
                                            : "renewals aren't"}{" "}
                                        paid and{" "}
                                        {failed === 1 ? "needs" : "need"} you.
                                    </span>
                                    <Button
                                        variant="outline"
                                        className="h-8 rounded-[8px] border-destructive-subtle-foreground px-3 text-[12.5px] font-semibold coarse:h-11"
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
                                description="Put someone on a plan and their first invoice is issued at once; each renewal after that invoices itself."
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
                            <div className="rounded-xl border border-dashed border-border-strong px-5 py-10 text-center text-[13px] text-muted-foreground">
                                {needle
                                    ? `No ${TAB_LABEL[tab].toLowerCase()} subscriptions match “${query.trim()}”.`
                                    : `No ${TAB_LABEL[tab].toLowerCase()} subscriptions.`}
                            </div>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {rows.map((s) => (
                                    <li key={s.id}>
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
                        )}
                        {truncated ? (
                            <p className="mt-3 max-w-[68ch] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                                Showing the newest {LIST_LIMIT} subscriptions
                                and every active or paused one; older cancelled
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
