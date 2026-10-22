"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Notice } from "@saroh/ui/notice";
import { countLabel, PageHeader } from "@saroh/ui/page-header";
import { TabStrip } from "@saroh/ui/tabs";
import { Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LimitNoticeBlock } from "@/components/billing/limit-notice";
import type { ContactOption } from "@/components/shared/fields/contact-picker";
import type { OnlinePaymentsLock } from "@/lib/billing/access";
import type { MissingRates } from "@/lib/gst-rates/missing";
import { LIST_LIMIT } from "@/lib/lists/capped";
import { livePlans } from "@/lib/subscriptions/plan-cards";
import type {
    Optional,
    Plan,
    Subscription,
    SubscriptionCharge,
    SubscriptionSettings,
} from "@/lib/subscriptions/service";
import type { ScreenTab } from "@/lib/subscriptions/view";
import {
    defaultView,
    listSummary,
    viewFromQuery,
} from "@/lib/subscriptions/view";

import { NEW_PLAN_HREF, PlansTab } from "./plans-tab";
import { SubscribeDialog } from "./subscribe-dialog";
import { SubscribersList } from "./subscribers-list";
import { SubscriptionQuickLook } from "./subscription-quick-look";

/**
 * Payments → Subscriptions, after "Saroh Subscriptions" and the audit of
 * 12 Oct 2026. Two views: who is subscribed, and the plans on sale (D3).
 *
 * Subscribers opens on who needs the owner: when a renewal isn't paid the
 * header leads with it ("8 need you · ₹6,600 unpaid") and the list lands
 * on those. With nobody to chase it reads "12 active" and lands on the
 * active ones. A view someone chose is in the address (`?view=`) and wins
 * over that. A row opens a quick look; every change happens on the
 * subscription's own page, which the quick look opens with the step ready.
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
    renewalsLate = null,
    canWrite,
    initialTab,
    initialView,
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
    /** Whether plan rows say their classes (Appointments on). */
    showClasses: boolean;
    contacts: ContactOption[];
    /** Each subscription's invoices, for the quick look's last charges. */
    charges: Optional<Record<string, SubscriptionCharge[]>>;
    /**
     * The warning when renewals are late or have never run ("Renewals
     * last ran …, later than it should have."). Null on time, or when it
     * couldn't be read: nothing is said then.
     */
    renewalsLate?: string | null;
    canWrite: boolean;
    initialTab: ScreenTab;
    /**
     * `?view=` as the address has it: the list's view on Subscribers, the
     * plans' on Plans. Older links say a list view as `?tab=`.
     */
    initialView?: string;
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
    // The view the address chose, until a tab is picked: the other tab
    // then opens on its own default.
    const [view, setView] = useState(initialView);
    const [peekId, setPeekId] = useState<string | null>(null);
    const [subscribing, setSubscribing] = useState(Boolean(openSubscribe));
    const landing = defaultView(subscriptions);

    // An older link says a list view as `?tab=failed`. The list writes
    // `?view=`, so the address is moved over once and the two never
    // disagree after a choice.
    useEffect(() => {
        const url = new URL(window.location.href);
        const old = url.searchParams.get("tab");
        if (!old || old === "plans") return;
        const chosen = viewFromQuery(url.searchParams.get("view") ?? old);
        url.searchParams.delete("tab");
        if (chosen && chosen !== landing) url.searchParams.set("view", chosen);
        else url.searchParams.delete("view");
        window.history.replaceState(null, "", url.pathname + url.search);
    }, [landing]);

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
        setView(undefined);
        setPeekId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("view");
        if (next === "plans") url.searchParams.set("tab", next);
        else url.searchParams.delete("tab");
        window.history.replaceState(null, "", url.pathname + url.search);
    }

    const summary = listSummary(subscriptions);
    const plans = planRead ?? [];
    const onPlans = tab === "plans";
    const peek = subscriptions.find((s) => s.id === peekId) ?? null;
    // Subscribing someone new, where the plan allows it.
    const canSubscribe = canWrite && !newLocked;
    // A new plan, where the business's plan has memberships.
    const canAddPlan = canWrite && !plansLocked && planRead !== null;

    return (
        <>
            <PageHeader
                className="mb-4"
                breadcrumb={["Payments", "Subscriptions"]}
                title="Subscriptions"
                count={countLabel(subscriptions.length, {
                    one: "subscription",
                    other: "subscriptions",
                })}
                // A summary, not a count of the list: before the button.
                // What needs the owner comes first, and reads as it is.
                meta={
                    subscriptions.length > 0 ? (
                        <>
                            {summary.lead ? (
                                <span
                                    data-need-you=""
                                    className="font-semibold text-destructive-subtle-foreground"
                                >
                                    {summary.lead}
                                </span>
                            ) : null}
                            <span>{summary.rest}</span>
                        </>
                    ) : undefined
                }
                actions={
                    canSubscribe || (onPlans && canAddPlan) ? (
                        <>
                            {canSubscribe ? (
                                <Button
                                    // On Plans the main thing to do is a
                                    // new plan: this one steps back.
                                    variant={
                                        onPlans && canAddPlan
                                            ? "outline"
                                            : "default"
                                    }
                                    onClick={() => setSubscribing(true)}
                                >
                                    Subscribe someone
                                </Button>
                            ) : null}
                            {onPlans && canAddPlan ? (
                                <Button asChild>
                                    <Link href={NEW_PLAN_HREF}>New plan</Link>
                                </Button>
                            ) : null}
                        </>
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
            {/* The system's own status, said only when it is the owner's
                problem: renewals are late, so invoices are waiting. */}
            {renewalsLate ? (
                <Notice tone="warning" className="mb-3">
                    {renewalsLate}
                </Notice>
            ) : null}
            {/* Two views: who is subscribed, and the plans on sale. Where
                each subscription stands narrows the one list, so it is the
                list's own dropdown, not more tabs. */}
            <TabStrip
                label="Subscriptions"
                idPrefix="tab"
                value={tab}
                onValueChange={(v) =>
                    pick(v === "plans" ? "plans" : "subscribers")
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
                        // The plans on sale now; the list's views count
                        // the archived ones and the drafts. No count when
                        // they couldn't be read: a 0 would say there are
                        // none.
                        count: planRead ? livePlans(planRead) : undefined,
                    },
                ]}
            />
            <div
                id="subscriptions-panel"
                role="tabpanel"
                aria-labelledby={`tab-${tab}`}
                className="pt-4"
            >
                {onPlans ? (
                    <PlansTab
                        plans={planRead}
                        canWrite={canWrite}
                        showClasses={showClasses}
                        settings={settings}
                        nowIso={nowIso}
                        locked={plansLocked}
                        missingRates={missingRates}
                        initialView={view}
                    />
                ) : subscriptions.length === 0 ? (
                    <EmptyState
                        icon={<Repeat />}
                        title="No one is subscribed yet"
                        description="Put a customer on a plan and their first invoice goes out straight away."
                        action={
                            canSubscribe ? (
                                <Button onClick={() => setSubscribing(true)}>
                                    Subscribe someone
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <>
                        <SubscribersList
                            subscriptions={subscriptions}
                            plans={plans}
                            now={now}
                            initialView={viewFromQuery(view)}
                            onOpen={(s) => setPeekId(s.id)}
                        />
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
