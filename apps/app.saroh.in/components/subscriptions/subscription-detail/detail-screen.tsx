"use client";

import { formatDate } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";
import { AbsentOr } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { autopayPanel } from "@/lib/subscriptions/autopay";
import { pauseNote, pauseOptions } from "@/lib/subscriptions/pause";
import type {
    Optional,
    Plan,
    SubscriberCard,
    Subscription,
    SubscriptionCharge,
    SubscriptionEventsPage,
} from "@/lib/subscriptions/service";
import {
    chargeRow,
    chargingText,
    collectionRows,
    failWhy,
    gstNote,
    headline,
    initials,
    keepsLine,
    listTab,
    olderPrice,
    paysBy,
    recurringPrice,
    retryOffer,
    sortCharges,
    subscriptionPay,
} from "@/lib/subscriptions/view";

import { StatusBadge } from "@/components/shared/status-badge";
import { Notice } from "@saroh/ui/notice";
import { SubscribeDialog } from "../subscribe-dialog";
import type { Step } from "./action-dialogs";
import { ActionDialog } from "./action-dialogs";
import { AutopayActions } from "./autopay-panel";
import { ChangesCard } from "./changes-card";
import {
    ChargesCard,
    CollectionsCard,
    CustomerCard,
    PayLinkRow,
    PlanCard,
} from "./panels";
import { useSubscriptionActions } from "./use-subscription-actions";
interface Action {
    label: string;
    kind: "primary" | "plain" | "danger";
    go: () => void;
}

/**
 * Payments → Subscriptions → one subscription, after "Saroh Subscription
 * Detail" layout 2a: the next charge first, then what is collected and
 * charged, with who, on what plan, and what changed beside it.
 *
 * Every change is one call with Undo in its toast — pause, resume, skip,
 * change plan from the next renewal, cancel at period end. Cancelling today
 * is the one step that cannot be undone, and its sheet says so.
 */
export function SubscriptionDetail({
    sub,
    charges,
    changes,
    viewerId,
    plans,
    card,
    ran,
    bizName,
    canWrite,
    canPayLink,
    initialStep,
    openSetUpLink = false,
    contacts,
    nowIso,
}: {
    sub: Subscription;
    charges: Optional<SubscriptionCharge[]>;
    /** Its log's first page (D9). */
    changes: Optional<SubscriptionEventsPage>;
    /** Who is looking, so their own changes read "You". */
    viewerId: string | null;
    plans: Plan[];
    card: SubscriberCard | null;
    ran: { text: string; late: boolean } | null;
    bizName: string | null;
    canWrite: boolean;
    /** A new pay link needs `invoice:write` as well. */
    canPayLink: boolean;
    /** `?do=` from the list's quick look. */
    initialStep: Step | "restart" | null;
    /**
     * `?do=autopay-link` from Home's "Send a set-up link" (D14): opens that
     * sheet, when this screen offers it.
     */
    openSetUpLink?: boolean;
    contacts: ContactOption[];
    nowIso: string;
}) {
    const router = useRouter();
    const now = new Date(nowIso);
    const tab = listTab(sub);
    const tz = sub.timezone;
    const name = sub.contact.name;
    const first = name.split(" ")[0] ?? name;

    const allowed = allowedSteps(sub);
    const [step, setStep] = useState<Step | null>(
        canWrite &&
            initialStep &&
            initialStep !== "restart" &&
            allowed.includes(initialStep)
            ? initialStep
            : null,
    );
    const [restarting, setRestarting] = useState(
        canWrite && initialStep === "restart" && tab === "cancelled",
    );
    const {
        busy,
        busyDate,
        payLink,
        pause,
        resume,
        switchTo,
        keepCurrentPlan,
        cancel,
        keep,
        toggleSkip,
        newPayLink,
        chargeAgain,
        rateStep,
    } = useSubscriptionActions(sub, plans, now, () => setStep(null));

    // The step came in the address; once opened, a refresh shouldn't reopen it.
    useEffect(() => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has("do")) return;
        url.searchParams.delete("do");
        window.history.replaceState(null, "", url.pathname + url.search);
    }, []);

    const periodEndText = formatDate(sub.currentPeriodEnd, tz, { now });
    const nextText = sub.nextRenewalAt
        ? formatDate(sub.nextRenewalAt, tz, { now })
        : null;

    const failedId = sub.failedCharge?.id;
    // Retry by autopay or by a new link, as the API offers it (D13); none
    // while a charge is under way.
    const retry = retryOffer(sub, canPayLink);
    const charging = chargingText(sub, now);
    const actions: Action[] = !canWrite
        ? []
        : tab === "failed"
          ? [
                ...(retry
                    ? [
                          {
                              label: retry.label,
                              kind: "primary" as const,
                              go:
                                  retry.via === "MANDATE"
                                      ? chargeAgain
                                      : newPayLink,
                          },
                      ]
                    : []),
                ...(failedId
                    ? [
                          {
                              label: "Record a payment",
                              kind: "plain" as const,
                              go: () =>
                                  router.push(`/billing/invoices/${failedId}`),
                          },
                      ]
                    : []),
                ...(sub.status === "ACTIVE"
                    ? [
                          {
                              label: "Pause instead",
                              kind: "plain" as const,
                              go: () => setStep("pause"),
                          },
                      ]
                    : []),
                {
                    label: "Cancel",
                    kind: "danger",
                    go: () => setStep("cancel"),
                },
            ]
          : tab === "active"
            ? sub.endsAt
                ? [{ label: "Keep it going", kind: "primary", go: keep }]
                : [
                      {
                          label: "Pause",
                          kind: "plain",
                          go: () => setStep("pause"),
                      },
                      {
                          label: "Change plan",
                          kind: "plain",
                          go: () => setStep("switch"),
                      },
                      {
                          label: "Cancel",
                          kind: "danger",
                          go: () => setStep("cancel"),
                      },
                  ]
            : tab === "paused"
              ? [
                    { label: "Resume now", kind: "primary", go: resume },
                    {
                        label: "Cancel",
                        kind: "danger",
                        go: () => setStep("cancel"),
                    },
                ]
              : [
                    {
                        label: "Restart",
                        kind: "primary",
                        go: () => setRestarting(true),
                    },
                ];

    const pending =
        sub.pendingPlan && tab !== "cancelled" ? sub.pendingPlan : null;
    const how = charges.state === "ok" ? paysBy(charges.data) : null;
    const head = headline(sub, how, now);
    const autopay = autopayPanel(sub, { canWrite, paysBy: how, now });
    const older = olderPrice(sub, plans);
    const plan = plans.find((p) => p.id === sub.plan.id);
    const rows = collectionRows(sub, now);
    const chargeRows =
        charges.state === "ok"
            ? sortCharges(charges.data).map((c) => chargeRow(c, tz, now))
            : [];
    const footer = [
        ran?.text,
        charges.state === "ok" ? gstNote(charges.data) : "",
    ]
        .filter(Boolean)
        .join(" ");
    const unpaid =
        sub.latestInvoice?.status === "ISSUED"
            ? {
                  id: sub.latestInvoice.id,
                  label: sub.latestInvoice.number ?? "the unpaid invoice",
              }
            : null;

    return (
        <>
            <div className="flex flex-col gap-4 px-4 pb-[26px] pt-5 sm:px-[26px]">
                <PageHeader
                    holdsData
                    className="mb-0"
                    breadcrumb={[
                        "Payments",
                        <Link key="list" href="/billing/subscriptions">
                            Subscriptions
                        </Link>,
                        name,
                    ]}
                    title={name}
                    badge={
                        <StatusBadge tone={head.pill.tone}>
                            {head.pill.label}
                        </StatusBadge>
                    }
                    description={[
                        sub.plan.name,
                        // What they pay a period, GST and all.
                        recurringPrice(
                            subscriptionPay(sub),
                            sub.currency,
                            sub.interval,
                        ),
                        `Since ${formatDate(sub.startedAt, tz, { now })}`,
                        bizName,
                    ]
                        .filter(Boolean)
                        .join(" · ")}
                />
                <section
                    aria-label="Next charge"
                    className="flex flex-wrap items-end gap-5 rounded-xl border border-border-strong bg-card px-5 py-[18px]"
                >
                    <div className="min-w-0 flex-[1_1_300px]">
                        <div className="label">Next charge</div>
                        <div className="mt-0.5 font-display text-[30px] font-semibold tabular-nums leading-[1.15] tracking-[-0.02em]">
                            <AbsentOr says="None">{head.big}</AbsentOr>
                        </div>
                        <div className="text-[12.5px] text-muted-foreground">
                            {head.when}
                        </div>
                    </div>
                    <div className="flex flex-[1_1_100%] flex-wrap items-center gap-3 border-t border-border/70 pt-3.5">
                        {actions.length ? (
                            <div className="flex flex-wrap gap-2">
                                {actions.map((a) => (
                                    <Button
                                        key={a.label}
                                        variant={
                                            a.kind === "primary"
                                                ? "default"
                                                : "outline"
                                        }
                                        disabled={busy}
                                        onClick={a.go}
                                        className={cn(
                                            a.kind === "danger" &&
                                                "text-destructive-subtle-foreground hover:text-destructive-subtle-foreground",
                                        )}
                                    >
                                        {a.label}
                                    </Button>
                                ))}
                            </div>
                        ) : null}
                        <span className="flex-[1_1_220px] text-[12.5px] text-foreground/75">
                            {head.line}
                        </span>
                    </div>
                </section>

                {!canWrite ? (
                    <ReadOnlyNote className="mb-0">
                        Your role can see this subscription but not change it.
                    </ReadOnlyNote>
                ) : null}

                {tab === "failed" ? (
                    <Notice tone="error">
                        <div className="text-[13.5px] font-bold text-destructive-subtle-foreground">
                            {failWhy(sub, now)}
                        </div>
                        <div className="mt-[3px] text-[12.5px] leading-[1.5] text-foreground/75">
                            {charging
                                ? `${charging}. The pay link is held until their bank answers, so ${first} isn't charged twice.`
                                : sub.retryVia === "MANDATE"
                                  ? `Their autopay didn't collect it, and Saroh doesn't try again on its own. Charge autopay again, send a new link, record a payment you took, pause or cancel.`
                                  : `Saroh doesn't charge a card or try again on its own. ${first} pays through the invoice's link. Send a new link, record a payment you took, pause or cancel.`}
                        </div>
                        {payLink ? (
                            <PayLinkRow url={payLink} name={first} />
                        ) : null}
                    </Notice>
                ) : null}

                {pending && canWrite ? (
                    <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-border-strong bg-muted px-[13px] py-2.5">
                        <span className="flex-[1_1_240px] text-[13px] font-semibold text-foreground">
                            Changes to {pending.name} (
                            {formatMoneyMajor(
                                subscriptionPay(pending),
                                pending.currency,
                            )}
                            ) from {formatDate(pending.from, tz, { now })}. No
                            part-payment.
                        </span>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={keepCurrentPlan}
                            className="border-border-strong"
                        >
                            Keep current plan
                        </Button>
                    </div>
                ) : null}

                <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
                    <div className="flex min-w-0 flex-col gap-3.5">
                        {rows.length ? (
                            <CollectionsCard
                                rows={rows}
                                what={sub.collection?.note ?? null}
                                hint={
                                    tab === "failed"
                                        ? "Not collected until the renewal is paid"
                                        : "Skip one. Nothing is refunded, and it isn't collected"
                                }
                                canWrite={canWrite}
                                busyDate={busyDate}
                                onToggle={(r) => void toggleSkip(r)}
                            />
                        ) : null}
                        <ChargesCard
                            state={charges.state}
                            rows={chargeRows}
                            footer={footer}
                        />
                    </div>
                    <div className="flex min-w-0 flex-col gap-3.5">
                        <CustomerCard
                            contactId={sub.contact.id}
                            name={name}
                            initials={initials(name)}
                            reach={[card?.phone, sub.contact.email]
                                .filter(Boolean)
                                .join(" · ")}
                            allergy={
                                card?.allergens.length
                                    ? `Allergy: ${card.allergens.join(", ")}`
                                    : null
                            }
                        />
                        <PlanCard
                            name={sub.plan.name}
                            what={plan?.description ?? null}
                            price={recurringPrice(
                                subscriptionPay(sub),
                                sub.currency,
                                sub.interval,
                            )}
                            older={older ? keepsLine(sub, older) : null}
                            // What the customer set up (D12) comes first;
                            // staff manage it from here (D14).
                            paysBy={autopay.line}
                        >
                            <AutopayActions
                                subscriptionId={sub.id}
                                panel={autopay}
                                card={sub.autopayCard ?? null}
                                openSend={openSetUpLink}
                                firstName={first}
                                timeZone={tz}
                                now={now}
                            />
                        </PlanCard>
                        <ChangesCard
                            // A fresh page after an action starts the card over.
                            key={
                                changes.state === "ok"
                                    ? (changes.data.events[0]?.id ?? "none")
                                    : changes.state
                            }
                            page={changes}
                            sub={sub}
                            viewerId={viewerId}
                            now={now}
                        />
                    </div>
                </div>
            </div>

            <ActionDialog
                step={step}
                onClose={() => setStep(null)}
                busy={busy}
                pauseOptions={pauseOptions(sub, now)}
                pauseNote={(option) => pauseNote(option, sub, now)}
                plans={plans}
                currentPlanId={sub.plan.id}
                switchNote={`Starts at the next renewal${nextText ? `, ${nextText}` : ""}. This period stays as it is, with no part-payments.`}
                onPause={pause}
                onSwitch={switchTo}
                cancel={{
                    canWaitForPeriodEnd:
                        sub.status === "ACTIVE" && tab !== "failed",
                    periodEndText,
                    unpaid,
                    failed: tab === "failed",
                }}
                onCancel={cancel}
            />
            {rateStep}
            {canWrite && tab === "cancelled" ? (
                <SubscribeDialog
                    open={restarting}
                    onOpenChange={setRestarting}
                    contacts={contacts}
                    plans={plans}
                    initialContactId={sub.contact.id}
                    autopayOffered={sub.autopayCard?.offered ?? false}
                    initialPlanId={
                        plan?.status === "ACTIVE" ? sub.plan.id : undefined
                    }
                />
            ) : null}
        </>
    );
}

/** The steps a `?do=` may open, by where it stands. */
function allowedSteps(sub: Subscription): Step[] {
    const tab = listTab(sub);
    if (tab === "cancelled") return [];
    if (tab === "paused") return ["cancel"];
    if (tab === "failed") {
        return sub.status === "ACTIVE" ? ["pause", "cancel"] : ["cancel"];
    }
    return sub.endsAt ? [] : ["pause", "switch", "cancel"];
}
