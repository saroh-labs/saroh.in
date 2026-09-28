"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { BuyPackSheet } from "./buy-pack-sheet";
import { CancelSheet } from "./cancel-sheet";
import type { AccountPlanTab, AccountSubscription, AccountView } from "./model";
import {
    accountDate,
    accountMoney,
    packLine,
    planClassesLine,
    planLine,
    planPrice,
} from "./model";
import type { PlanPacksShop } from "./packs-api";
import {
    AccountCard,
    AccountRow,
    buttonClasses,
    smallButton,
    Tag,
    Unavailable,
} from "./parts";
import { PauseSheet } from "./pause-sheet";
import type { PlanApi, PlanChangeResult } from "./plan-api";
import { PLAN_OFFLINE } from "./plan-api";

/**
 * The account's Plan tab (round-2 plan A, A8; Saroh Customer Site design):
 * the member's plan with its price, next payment and classes left, and
 * their class packs with what is left and when they expire.
 *
 * From here a member pauses for 2, 4 or 8 weeks (when the business lets
 * them), resumes, cancels at the end of the period ("Pause instead" first),
 * and pays an overdue invoice with "Pay now", which opens a pay link made
 * that moment. There is no plan change (default 8) and no autopay until
 * D12. Everything goes through the site's server actions (`api`).
 *
 * With packs on sale (A11, `packs`), the Class packs card shows even with
 * none held, and "Buy a pack" opens the sheet that buys one online — or
 * says to buy at the desk when the business takes no payment online.
 */

export type { PayNowResult, PlanApi, PlanChangeResult } from "./plan-api";

export interface PlanTabProps {
    account: AccountView;
    tab: AccountPlanTab;
    api: PlanApi;
    /** Packs on sale online and the actions that buy one (A11). */
    packs?: PlanPacksShop | null;
}

/** What is being done, to which plan: one thing at a time. */
type Busy = { ref: string; what: "pay" | "resume" } | null;

type Open =
    | { kind: "pause"; plan: AccountSubscription }
    | { kind: "cancel"; plan: AccountSubscription }
    | { kind: "buy" }
    | null;

export function PlanTab({
    account,
    tab: initial,
    api,
    packs: shop = null,
}: PlanTabProps) {
    const router = useRouter();
    const [tab, setTab] = useState(initial);
    // A refresh from the server (after a pack is bought, A11) brings the
    // tab as it is now: taken while rendering, as React advises for state
    // that follows a prop.
    const [fromServer, setFromServer] = useState(initial);
    if (initial !== fromServer) {
        setFromServer(initial);
        setTab(initial);
    }
    const [open, setOpen] = useState<Open>(null);
    const [busy, setBusy] = useState<Busy>(null);
    const [said, setSaid] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);

    function done(result: Extract<PlanChangeResult, { ok: true }>) {
        setTab(result.tab);
        setOpen(null);
        setProblem(null);
        setSaid(result.message);
        router.refresh();
    }

    async function resume(plan: AccountSubscription) {
        if (busy) return;
        setBusy({ ref: plan.ref, what: "resume" });
        setSaid(null);
        setProblem(null);
        const result = await api
            .resume(plan.ref)
            .catch((): PlanChangeResult => ({
                ok: false,
                message: PLAN_OFFLINE,
            }));
        setBusy(null);
        if (result.ok) done(result);
        else setProblem(result.message);
    }

    async function payNow(plan: AccountSubscription) {
        if (busy) return;
        setBusy({ ref: plan.ref, what: "pay" });
        setSaid(null);
        setProblem(null);
        const result = await api
            .payNow(plan.ref)
            .catch(() => ({ ok: false as const, message: PLAN_OFFLINE }));
        if (result.ok) {
            // The pay page is the business's own; the link was made just now.
            window.location.assign(result.url);
            return;
        }
        setBusy(null);
        setProblem(result.message);
    }

    const plans = tab.subscriptions;
    const packs = tab.packs;
    const canBuy = shop !== null && shop.onSale.packs.length > 0;
    const showPacks = !packs.ok || packs.value.length > 0 || canBuy;

    return (
        <div className="grid gap-3.5">
            <h1 className="font-site-heading text-site-fg m-0 text-[26px] font-semibold tracking-[-0.02em]">
                Plan
            </h1>
            {said ? (
                <p role="status" className="text-site-body text-sm">
                    {said}
                </p>
            ) : null}
            {problem ? (
                <p role="alert" className={destructiveAlertClasses}>
                    {problem}
                </p>
            ) : null}

            {!plans.ok ? (
                <AccountCard labelledBy="plan-membership" title="Membership">
                    <Unavailable what="Your plan" />
                </AccountCard>
            ) : plans.value.length === 0 ? (
                <AccountCard
                    labelledBy="plan-membership"
                    title="No plan yet"
                    lead={`You're not on a plan with ${account.businessName}.`}
                />
            ) : (
                plans.value.map((plan, i) => (
                    <PlanCard
                        key={plan.ref}
                        id={`plan-${i}`}
                        plan={plan}
                        busy={busy?.ref === plan.ref ? busy.what : null}
                        disabled={busy !== null}
                        onPayNow={() => void payNow(plan)}
                        onPause={() => {
                            setSaid(null);
                            setOpen({ kind: "pause", plan });
                        }}
                        onResume={() => void resume(plan)}
                        onCancel={() => {
                            setSaid(null);
                            setOpen({ kind: "cancel", plan });
                        }}
                    />
                ))
            )}

            {showPacks ? (
                <AccountCard
                    labelledBy="plan-packs"
                    title="Class packs"
                    lead={
                        packs.ok && packs.value.length === 0
                            ? "No packs."
                            : undefined
                    }
                    actions={
                        canBuy ? (
                            <button
                                type="button"
                                className={buttonClasses(false)}
                                disabled={busy !== null}
                                onClick={() => {
                                    setSaid(null);
                                    setProblem(null);
                                    setOpen({ kind: "buy" });
                                }}
                            >
                                Buy a pack
                            </button>
                        ) : undefined
                    }
                >
                    {packs.ok ? (
                        packs.value.map((pack, i) => (
                            <AccountRow
                                key={`${pack.name}-${pack.expiresAt}-${i}`}
                                title={pack.name}
                                sub={packLine(pack)}
                                tag={
                                    pack.live ? (
                                        <Tag tone="accent">Active</Tag>
                                    ) : (
                                        <Tag tone="quiet">Used up</Tag>
                                    )
                                }
                            />
                        ))
                    ) : (
                        <Unavailable what="Your packs" />
                    )}
                </AccountCard>
            ) : null}

            {shop && canBuy ? (
                <BuyPackSheet
                    open={open?.kind === "buy"}
                    onClose={() => setOpen(null)}
                    onSale={shop.onSale}
                    businessName={account.businessName}
                    customer={{ name: account.name, email: account.email }}
                    api={shop.api}
                    onBought={(message) => {
                        setOpen(null);
                        setProblem(null);
                        setSaid(message);
                        // The new pack is read with the tab.
                        router.refresh();
                    }}
                />
            ) : null}
            <PauseSheet
                plan={open?.kind === "pause" ? open.plan : null}
                weeks={tab.pauseWeeks}
                onClose={() => setOpen(null)}
                pause={api.pause}
                onDone={done}
            />
            <CancelSheet
                plan={open?.kind === "cancel" ? open.plan : null}
                canPauseInstead={
                    open?.kind === "cancel" &&
                    open.plan.canPause &&
                    tab.pauseWeeks.length > 0
                }
                onClose={() => setOpen(null)}
                cancel={api.cancel}
                onDone={done}
                onPauseInstead={() =>
                    setOpen((o) =>
                        o?.kind === "cancel"
                            ? { kind: "pause", plan: o.plan }
                            : o,
                    )
                }
            />
        </div>
    );
}

function PlanCard({
    id,
    plan,
    busy,
    disabled,
    onPayNow,
    onPause,
    onResume,
    onCancel,
}: {
    id: string;
    plan: AccountSubscription;
    busy: "pay" | "resume" | null;
    disabled: boolean;
    onPayNow: () => void;
    onPause: () => void;
    onResume: () => void;
    onCancel: () => void;
}) {
    const overdue = plan.payNow;
    const sub = overdue
        ? `${accountMoney(overdue.total, overdue.currency)} is overdue${overdue.dueAt ? ` since ${accountDate(overdue.dueAt, plan.timezone)}` : ""}`
        : planLine(plan);
    const classes = planClassesLine(plan);
    const actions = (
        <>
            {overdue ? (
                <button
                    type="button"
                    className={buttonClasses(true)}
                    disabled={disabled}
                    onClick={onPayNow}
                >
                    {busy === "pay" ? "Opening…" : "Pay now"}
                </button>
            ) : null}
            {plan.canResume ? (
                <button
                    type="button"
                    className={buttonClasses(false)}
                    disabled={disabled}
                    onClick={onResume}
                >
                    {busy === "resume" ? "Resuming…" : "Resume"}
                </button>
            ) : plan.canPause ? (
                <button
                    type="button"
                    className={buttonClasses(false)}
                    disabled={disabled}
                    onClick={onPause}
                >
                    Pause
                </button>
            ) : null}
            {plan.canCancel ? (
                <button
                    type="button"
                    className={smallButton}
                    disabled={disabled}
                    onClick={onCancel}
                >
                    Cancel
                </button>
            ) : null}
        </>
    );
    return (
        <AccountCard labelledBy={id} title="Membership" actions={actions}>
            <AccountRow
                title={`${plan.name} · ${planPrice(plan)}`}
                sub={
                    <>
                        {sub}
                        {classes ? (
                            <span className="mt-0.5 block">{classes}</span>
                        ) : null}
                    </>
                }
                tag={
                    overdue ? (
                        <Tag tone="accent">Needs you</Tag>
                    ) : plan.status === "PAUSED" ? (
                        <Tag tone="quiet">Paused</Tag>
                    ) : plan.endsAt ? (
                        <Tag tone="quiet">Ending</Tag>
                    ) : (
                        <Tag tone="accent">Active</Tag>
                    )
                }
            />
        </AccountCard>
    );
}
