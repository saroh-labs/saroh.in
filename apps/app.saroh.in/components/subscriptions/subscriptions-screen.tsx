"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Repeat, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { LIST_LIMIT } from "@/lib/lists/capped";
import type {
    Optional,
    Plan,
    Subscription,
    SubscriptionCharge,
} from "@/lib/subscriptions/service";
import type { ListTab } from "@/lib/subscriptions/view";
import {
    initials,
    listTab,
    money,
    monthlyTotal,
    olderPrice,
    rowWhen,
    shortPrice,
    TAB_LABEL,
    TAB_TONE,
} from "@/lib/subscriptions/view";

import { PaymentsCrumbs } from "./payments-crumbs";
import { Pill } from "./pill";
import { SubscribeDialog } from "./subscribe-dialog";
import { SubscriptionQuickLook } from "./subscription-quick-look";

const TABS: ListTab[] = ["active", "failed", "paused", "cancelled"];
const SEARCH_FROM = 8;

const TAB_CLASS =
    "inline-flex items-center px-3.5 py-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11";

/**
 * Payments → Subscriptions, after "Saroh Subscriptions": who is on which
 * plan, sorted by where each stands (Active / Payment failed / Paused /
 * Cancelled). A row opens a quick look; every change happens on the
 * subscription's own page, which the quick look opens with the step ready.
 *
 * `now` comes from the server, so the words a row says are the same when
 * the page is drawn and when it hydrates.
 */
export function SubscriptionsScreen({
    subscriptions,
    truncated = false,
    plans,
    contacts,
    charges,
    renewNote,
    canWrite,
    initialTab,
    openSubscribe,
    nowIso,
}: {
    subscriptions: Subscription[];
    /** The newest read hit its cap: older cancelled ones are not here. */
    truncated?: boolean;
    plans: Plan[];
    contacts: ContactOption[];
    /** Each subscription's invoices, for the quick look's last charges. */
    charges: Optional<Record<string, SubscriptionCharge[]>>;
    /** "Renewals last ran …", and whether that is late; null when unknown. */
    renewNote: { text: string; late: boolean } | null;
    canWrite: boolean;
    initialTab: ListTab;
    /** `?subscribe=1`, from the command menu. */
    openSubscribe?: boolean;
    nowIso: string;
}) {
    const router = useRouter();
    const now = new Date(nowIso);
    const [tab, setTab] = useState<ListTab>(initialTab);
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
    function pick(next: ListTab) {
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
    const livePlans = plans.filter((p) => p.status === "ACTIVE").length;
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
                    {/* `contents`, so the tabs and the Plans link wrap as one
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
                    </div>
                    {/* Plans keep their own page for now (the redesign is
                        follow-up work); the tab the design draws is a link. */}
                    <Link
                        href="/billing/plans"
                        className={cn(
                            TAB_CLASS,
                            "font-medium text-muted-foreground hover:text-foreground",
                        )}
                    >
                        Plans
                        <Count n={livePlans} />
                    </Link>
                    {/* Search earns its row only on a list long enough to
                        need it; a phone has little room to spare. */}
                    {subscriptions.length > SEARCH_FROM ? (
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
                {failed > 0 && tab !== "failed" ? (
                    <div
                        role="alert"
                        className="mb-3.5 flex flex-wrap items-center gap-3 rounded-xl border border-destructive-subtle-foreground bg-destructive-subtle px-4 py-3"
                    >
                        <span className="flex-[1_1_260px] text-[13px] font-semibold text-destructive-subtle-foreground">
                            {failed}{" "}
                            {failed === 1 ? "renewal isn't" : "renewals aren't"}{" "}
                            paid and {failed === 1 ? "needs" : "need"} you.
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
                                <Button onClick={() => setSubscribing(true)}>
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
                                <Row
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
                        Showing the newest {LIST_LIMIT} subscriptions and every
                        active or paused one; older cancelled ones are not
                        listed.
                    </p>
                ) : null}
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

function Count({ n, danger = false }: { n: number; danger?: boolean }) {
    return (
        <span
            className={cn(
                "ml-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold",
                danger && n > 0
                    ? "bg-destructive-subtle text-destructive-subtle-foreground"
                    : "bg-muted text-muted-foreground",
            )}
        >
            {n}
        </span>
    );
}

function Row({
    sub,
    plans,
    now,
    open,
    onOpen,
}: {
    sub: Subscription;
    plans: readonly Plan[];
    now: Date;
    open: boolean;
    onOpen: () => void;
}) {
    const tab = listTab(sub);
    const when = rowWhen(sub, now);
    const older = olderPrice(sub, plans);
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-haspopup="dialog"
            className={cn(
                "flex w-full flex-wrap items-center gap-3 rounded-[11px] border border-border px-3.5 py-3 text-left hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                open
                    ? "bg-brand-subtle shadow-[inset_3px_0_0_hsl(var(--highlight))]"
                    : "bg-card",
            )}
        >
            <span
                aria-hidden
                className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold text-foreground"
            >
                {initials(sub.contact.name)}
            </span>
            <span className="min-w-0 flex-[2_1_200px]">
                <span className="block text-[14px] font-semibold text-foreground">
                    {sub.contact.name}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {sub.plan.name}
                    {sub.pendingPlan && tab !== "cancelled"
                        ? ` → ${sub.pendingPlan.name} next renewal`
                        : ""}
                    {older ? (
                        <>
                            {" · "}
                            <span className="text-brand">older price</span>
                        </>
                    ) : null}
                </span>
            </span>
            <span className="min-w-0 flex-[1_1_110px]">
                <Pill tone={TAB_TONE[tab]}>{TAB_LABEL[tab]}</Pill>
            </span>
            <span
                className={cn(
                    "min-w-0 flex-[2_1_200px] text-[12.5px]",
                    when.danger
                        ? "text-destructive-subtle-foreground"
                        : "text-muted-foreground",
                )}
            >
                {when.text}
            </span>
            <span className="shrink-0 font-display text-[14px] font-semibold tabular-nums text-foreground">
                {shortPrice(sub.price, sub.currency, sub.interval)}
            </span>
        </button>
    );
}
