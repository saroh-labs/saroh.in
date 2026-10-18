"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import {
    changePlanAction,
    raiseLimitAction,
    revokeLimitAction,
    trialAction,
} from "@/lib/business-actions";
import type { PlanOption } from "@/lib/businesses";
import { formatDate } from "@/lib/format";
import { legacyPickerBlocked } from "@/lib/plan-words";

import { OperatorDialog } from "../operator-dialog";

const selectClass =
    "h-[38px] w-full rounded-md border border-input bg-field px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11";

function PlanSelect({
    plans,
    name = "planId",
    defaultValue,
}: {
    plans: PlanOption[];
    name?: string;
    defaultValue?: string;
}) {
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={`plan-${name}`}>Plan</Label>
            <select
                id={`plan-${name}`}
                name={name}
                defaultValue={defaultValue ?? plans[0]?.id}
                className={selectClass}
                required
            >
                {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                        {plan.name} (v{plan.version})
                    </option>
                ))}
            </select>
        </div>
    );
}

/**
 * Plan, trial and limits for one business. A plan a billing provider
 * manages is changed with the provider, not here — the API refuses and says
 * so, and the dialog shows that reason. With a catalogue version live, its
 * plans are put on from the catalogue's own action ("Put on a plan"), so
 * the old picker isn't offered empty (UX-087).
 */
export function PlanActions({
    organizationId,
    plans,
    currentPlanId,
    subscriptionStatus,
    numericLimits,
    catalogueLive,
    onDone,
}: {
    organizationId: string;
    /** The old plans (`/admin/plans`); catalogue plans are never in it. */
    plans: PlanOption[];
    currentPlanId: string | null;
    subscriptionStatus: string | null;
    numericLimits: { key: string; label: string; planValue: number }[];
    /** A catalogue version is live on this instance. */
    catalogueLive: boolean;
    /** After a write went through: the screen's feedback (U3, R9). */
    onDone?: (message: string) => void;
}) {
    const blocked = legacyPickerBlocked(plans.length, catalogueLive);
    const trialing = subscriptionStatus === "TRIALING";
    const needsPlanForTrial =
        !subscriptionStatus || subscriptionStatus === "CANCELLED";

    return (
        <div className="flex flex-wrap gap-2">
            {blocked !== "catalogue" && (
                <OperatorDialog
                    trigger="Change plan"
                    title="Change plan"
                    effect="The business moves to the plan you choose now. Its limits follow the new plan from the next request."
                    fields={
                        <PlanSelect
                            plans={plans}
                            defaultValue={currentPlanId ?? undefined}
                        />
                    }
                    submitLabel="Change plan"
                    disabled={blocked === "none"}
                    disabledReason="No plan is offered on this instance yet."
                    onSubmit={({ reason, idempotencyKey, values }) =>
                        done(
                            changePlanAction(organizationId, {
                                reason,
                                idempotencyKey,
                                planId: values.planId ?? "",
                            }),
                            onDone,
                            "Plan changed.",
                        )
                    }
                />
            )}
            {(trialing || needsPlanForTrial) && (
                <OperatorDialog
                    trigger={trialing ? "Extend trial" : "Start trial"}
                    title={trialing ? "Extend the trial" : "Start a trial"}
                    effect={
                        trialing
                            ? "The trial runs on for the days you add, from its current end."
                            : "The business gets the plan's limits for the trial's length."
                    }
                    fields={
                        <>
                            {needsPlanForTrial && <PlanSelect plans={plans} />}
                            <div className="grid gap-1.5">
                                <Label htmlFor="trial-days">Days</Label>
                                <Input
                                    id="trial-days"
                                    name="days"
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={90}
                                    defaultValue={14}
                                    required
                                />
                            </div>
                        </>
                    }
                    submitLabel={trialing ? "Extend trial" : "Start trial"}
                    onSubmit={({ reason, idempotencyKey, values }) =>
                        done(
                            trialAction(organizationId, {
                                reason,
                                idempotencyKey,
                                days: Number(values.days),
                                planId:
                                    values.planId === ""
                                        ? undefined
                                        : values.planId,
                            }),
                            onDone,
                            trialing ? "Trial extended." : "Trial started.",
                        )
                    }
                />
            )}
            {numericLimits.length > 0 && (
                <RaiseLimitDialog
                    organizationId={organizationId}
                    limits={numericLimits}
                    onDone={onDone}
                />
            )}
        </div>
    );
}

/**
 * Raise a limit for a while (`subscription:override`): only upwards, only
 * this business, only until a date. The Billing tab's plan controls and the
 * Overview's usage card ("Raise a limit…", U3) open the same dialog, over
 * the screen it was opened from.
 */
export function RaiseLimitDialog({
    organizationId,
    limits,
    trigger = "Raise a limit",
    onDone,
}: {
    organizationId: string;
    limits: { key: string; label: string; planValue: number }[];
    trigger?: string;
    /** After it went through: the screen's feedback (U3, R9). */
    onDone?: (message: string) => void;
}) {
    const labelOf = (key: string | undefined) =>
        limits.find((l) => l.key === key)?.label ?? "The limit";
    return (
        <OperatorDialog
            trigger={trigger}
            title="Raise a limit for a while"
            effect="Only this business, only upwards, and only until the date you set. It is written into the trail with your name on it."
            fields={
                <>
                    <div className="grid gap-1.5">
                        <Label htmlFor="limit-key">Limit</Label>
                        <select
                            id="limit-key"
                            name="key"
                            className={selectClass}
                            required
                        >
                            {limits.map((limit) => (
                                <option key={limit.key} value={limit.key}>
                                    {limit.label} (plan allows {limit.planValue}
                                    )
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="limit-value">New limit</Label>
                            <Input
                                id="limit-value"
                                name="value"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                required
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="limit-days">
                                For how many days
                            </Label>
                            <Input
                                id="limit-days"
                                name="days"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={365}
                                defaultValue={30}
                                required
                            />
                        </div>
                    </div>
                </>
            }
            submitLabel="Raise limit"
            onSubmit={({ reason, idempotencyKey, values }) =>
                done(
                    raiseLimitAction(organizationId, {
                        reason,
                        idempotencyKey,
                        key: values.key ?? "",
                        value: Number(values.value),
                        days: Number(values.days),
                    }),
                    onDone,
                    `${labelOf(values.key)} raised to ${values.value ?? ""} for ${values.days ?? ""} days.`,
                )
            }
        />
    );
}

/**
 * A write's result, passed on; when it went through, `onDone` hears what
 * changed, in the past tense, for the screen's toast and highlight.
 */
export async function done<T extends { ok: boolean }>(
    write: Promise<T>,
    onDone: ((message: string) => void) | undefined,
    message: string,
): Promise<T> {
    const result = await write;
    if (result.ok) onDone?.(message);
    return result;
}

/** End a raised limit before it lapses. */
export function RevokeLimit({
    organizationId,
    overrideId,
    label,
    expiresAt,
}: {
    organizationId: string;
    overrideId: string;
    label: string;
    expiresAt: string;
}) {
    return (
        <OperatorDialog
            trigger="End early"
            triggerVariant="ghost"
            title={`End the raised ${label.toLowerCase()} limit`}
            effect={`It would have lasted until ${formatDate(expiresAt)}. The plan's own limit applies again from the next request.`}
            submitLabel="End raised limit"
            onSubmit={({ reason, idempotencyKey }) =>
                revokeLimitAction(organizationId, overrideId, {
                    reason,
                    idempotencyKey,
                })
            }
        />
    );
}
