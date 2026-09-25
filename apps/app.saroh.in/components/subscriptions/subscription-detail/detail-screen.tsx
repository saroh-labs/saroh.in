"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import type {
    Optional,
    Plan,
    SubscriberCard,
    Subscription,
    SubscriptionCharge,
} from "@/lib/subscriptions/service";
import {
    changeRows,
    chargeRow,
    collectionRows,
    dayText,
    failWhy,
    gstNote,
    headline,
    initials,
    listTab,
    longPrice,
    money,
    olderPrice,
    paysBy,
    sortCharges,
} from "@/lib/subscriptions/view";

import { PaymentsCrumbs } from "../payments-crumbs";
import { Pill } from "../pill";
import { SubscribeDialog } from "../subscribe-dialog";
import type { Step } from "./action-sheets";
import { ActionSheet } from "./action-sheets";
import {
    ChangesCard,
    ChargesCard,
    CollectionsCard,
    CustomerCard,
    PayLinkRow,
    PlanCard,
} from "./panels";
import { useSubscriptionActions } from "./use-subscription-actions";

const BTN = "h-[38px] rounded-[9px] px-4 text-[14px] font-semibold";

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
    plans,
    card,
    ran,
    bizName,
    canWrite,
    canPayLink,
    initialStep,
    contacts,
    nowIso,
}: {
    sub: Subscription;
    charges: Optional<SubscriptionCharge[]>;
    plans: Plan[];
    card: SubscriberCard | null;
    ran: { text: string; late: boolean } | null;
    bizName: string | null;
    canWrite: boolean;
    /** A new pay link needs `invoice:write` as well. */
    canPayLink: boolean;
    /** `?do=` from the list's quick look. */
    initialStep: Step | "restart" | null;
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
    } = useSubscriptionActions(sub, plans, now, () => setStep(null));

    // The step came in the address; once opened, a refresh shouldn't reopen it.
    useEffect(() => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has("do")) return;
        url.searchParams.delete("do");
        window.history.replaceState(null, "", url.pathname + url.search);
    }, []);

    const periodEndText = dayText(sub.currentPeriodEnd, tz, now);
    const nextText = sub.nextRenewalAt
        ? dayText(sub.nextRenewalAt, tz, now)
        : null;

    const failedId = sub.failedCharge?.id;
    const actions: Action[] = !canWrite
        ? []
        : tab === "failed"
          ? [
                ...(canPayLink && sub.failedCharge
                    ? [
                          {
                              label: "Retry with a new pay link",
                              kind: "primary" as const,
                              go: newPayLink,
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
            <PaymentsCrumbs
                here={name}
                back={{
                    href: "/billing/subscriptions",
                    label: "Subscriptions",
                }}
            />
            <div className="flex flex-col gap-4 px-6 pb-[26px] pt-5">
                <section
                    aria-label="Next charge"
                    className="flex flex-wrap items-end gap-5 rounded-xl border border-border-strong bg-card px-5 py-[18px]"
                >
                    <div className="min-w-0 flex-[1_1_300px]">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.02em]">
                                {name}
                            </h1>
                            <Pill tone={head.pill.tone}>{head.pill.label}</Pill>
                        </div>
                        <p className="mt-1 text-[12.5px] text-muted-foreground">
                            {[
                                sub.plan.name,
                                longPrice(
                                    sub.price,
                                    sub.currency,
                                    sub.interval,
                                ),
                                `Since ${dayText(sub.startedAt, tz, now)}`,
                                bizName,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                    <div className="flex-[0_1_auto] text-right">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Next charge
                        </div>
                        <div className="mt-0.5 font-display text-[30px] font-semibold tabular-nums leading-[1.15] tracking-[-0.02em]">
                            {head.big}
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
                                            BTN,
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
                    <div
                        role="alert"
                        className="rounded-xl border border-destructive-subtle-foreground bg-destructive-subtle px-4 py-[13px]"
                    >
                        <div className="text-[13.5px] font-bold text-destructive-subtle-foreground">
                            {failWhy(sub, now)}
                        </div>
                        <div className="mt-[3px] text-[12.5px] leading-[1.5] text-foreground/75">
                            Saroh doesn&apos;t charge a card or try again on its
                            own — {first} pays through the invoice&apos;s link.
                            Send a new link, record a payment you took, pause or
                            cancel.
                        </div>
                        {payLink ? (
                            <PayLinkRow url={payLink} name={first} />
                        ) : null}
                    </div>
                ) : null}

                {pending && canWrite ? (
                    <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-highlight bg-brand-subtle px-[13px] py-2.5">
                        <span className="flex-[1_1_240px] text-[13px] font-semibold text-brand-subtle-foreground">
                            Changes to {pending.name} (
                            {money(pending.price, pending.currency)}) from{" "}
                            {dayText(pending.from, tz, now)}. No part-payment.
                        </span>
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={keepCurrentPlan}
                            className="h-[30px] rounded-[8px] border-highlight px-[11px] text-[12.5px] font-semibold coarse:h-11"
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
                                        : "Skip one — nothing is refunded, it just isn't collected"
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
                            price={longPrice(
                                sub.price,
                                sub.currency,
                                sub.interval,
                            )}
                            older={
                                older
                                    ? `Keeps ${money(sub.price, sub.currency)} — the plan is ${money(older.listPrice, sub.currency)} for new sign-ups`
                                    : null
                            }
                            paysBy={
                                how
                                    ? `Pays by ${how}`
                                    : "Each renewal is invoiced with a pay link"
                            }
                        />
                        <ChangesCard rows={changeRows(sub, now)} />
                    </div>
                </div>
            </div>

            <ActionSheet
                step={step}
                onClose={() => setStep(null)}
                busy={busy}
                pauseNote={`Nothing is charged or collected until you resume it. The days it's paused are added to the period ${first} has paid for.`}
                plans={plans}
                currentPlanId={sub.plan.id}
                switchNote={`Starts at the next renewal${nextText ? `, ${nextText}` : ""}. This period stays as it is — no part-payments.`}
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
            {canWrite && tab === "cancelled" ? (
                <SubscribeDialog
                    open={restarting}
                    onOpenChange={setRestarting}
                    contacts={contacts}
                    plans={plans}
                    initialContactId={sub.contact.id}
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
