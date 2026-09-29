"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Repeat, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
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

import { PaymentsCrumbs } from "./payments-crumbs";
import { PlansTab } from "./plans-tab";
import { SubscribeDialog } from "./subscribe-dialog";
import { SubscriptionQuickLook } from "./subscription-quick-look";
import { Count, SubscriptionRow } from "./subscription-row";

const TABS: ListTab[] = ["active", "failed", "paused", "cancelled"];
const SEARCH_FROM = 8;

const TAB_CLASS =
    "inline-flex items-center px-3.5 py-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11";

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
    nowIso,
    settings = null,
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
    /** `?subscribe=1`, from the command menu. */
    openSubscribe?: boolean;
    nowIso: string;
    /** "Members can pause from their account" (A8); null when unread. */
    settings?: SubscriptionSettings | null;
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
                    {canWrite ? (
                        <Button
                            className="h-[38px] rounded-[9px] px-4 text-[14px] font-semibold"
                            onClick={() => setSubscribing(true)}
                        >
                            Subscribe someone
                        </Button>
                    ) : null}
                </div>
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
                <div className="flex flex-wrap items-end gap-x-0.5 border-b border-border">
                    {/* `contents`, so the tabs and the search wrap as one
                        row on a phone, as the design's do. */}
                    <div
                        role="tablist"
                        aria-label="Subscriptions"
                        className="contents"
                    >
                        {TABS.map((t) => {
                            const on = t === tab;
                            const n = count(t);
                            return (
                                <button
                                    key={t}
                                    type="button"
                                    role="tab"
                                    id={`tab-${t}`}
                                    aria-selected={on}
                                    aria-controls="subscriptions-panel"
                                    onClick={() => pick(t)}
                                    className={cn(
                                        TAB_CLASS,
                                        on
                                            ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--brand))]"
                                            : "font-medium text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {TAB_LABEL[t]}
                                    <Count n={n} danger={t === "failed"} />
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            role="tab"
                            id="tab-plans"
                            aria-selected={onPlans}
                            aria-controls="subscriptions-panel"
                            onClick={() => pick("plans")}
                            className={cn(
                                TAB_CLASS,
                                onPlans
                                    ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--brand))]"
                                    : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                        >
                            Plans
                            {/* No count when they couldn't be read: a 0
                                would say there are none. */}
                            {planRead ? (
                                <Count n={plansOnTab(planRead)} />
                            ) : null}
                        </button>
                    </div>
                    {/* Search earns its row only on a list long enough to
                        need it; a phone has little room to spare. */}
                    {!onPlans && subscriptions.length > SEARCH_FROM ? (
                        <label className="relative mb-1.5 ml-auto flex w-full items-center sm:w-[220px]">
                            <span className="sr-only">Search subscribers</span>
                            <Search
                                aria-hidden
                                className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
                            />
                            <Input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by name or plan"
                                className="h-8 rounded-[8px] pl-8 text-[12.5px]"
                            />
                        </label>
                    ) : null}
                </div>
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
                    />
                ) : (
                    <>
                        {failed > 0 && tab !== "failed" ? (
                            <div
                                role="alert"
                                className="mb-3.5 flex flex-wrap items-center gap-3 rounded-xl border border-destructive-subtle-foreground bg-destructive-subtle px-4 py-3"
                            >
                                <span className="flex-[1_1_260px] text-[13px] font-semibold text-destructive-subtle-foreground">
                                    {failed}{" "}
                                    {failed === 1
                                        ? "renewal isn't"
                                        : "renewals aren't"}{" "}
                                    paid and {failed === 1 ? "needs" : "need"}{" "}
                                    you.
                                </span>
                                <Button
                                    variant="outline"
                                    className="h-8 rounded-[8px] border-destructive-subtle-foreground px-3 text-[12.5px] font-semibold coarse:h-11"
                                    onClick={() => pick("failed")}
                                >
                                    Show them
                                </Button>
                            </div>
                        ) : null}
                        {subscriptions.length === 0 ? (
                            <EmptyState
                                icon={<Repeat />}
                                title="No one is subscribed yet"
                                description="Put someone on a plan and their first invoice is issued at once; each renewal after that invoices itself."
                                action={
                                    canWrite ? (
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
            {canWrite ? (
                <SubscribeDialog
                    open={subscribing}
                    onOpenChange={onSubscribeOpenChange}
                    contacts={contacts}
                    plans={plans}
                />
            ) : null}
        </>
    );
}
