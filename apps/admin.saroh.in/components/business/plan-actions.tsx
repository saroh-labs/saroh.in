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
import { camelToWords, formatDate } from "@/lib/format";

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
 * so, and the dialog shows that reason.
 */
export function PlanActions({
    organizationId,
    plans,
    currentPlanId,
    subscriptionStatus,
    numericLimits,
}: {
    organizationId: string;
    plans: PlanOption[];
    currentPlanId: string | null;
    subscriptionStatus: string | null;
    numericLimits: { key: string; planValue: number }[];
}) {
    const trialing = subscriptionStatus === "TRIALING";
    const needsPlanForTrial =
        !subscriptionStatus || subscriptionStatus === "CANCELLED";

    return (
        <div className="flex flex-wrap gap-2">
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
                disabled={plans.length === 0}
                disabledReason="No plan is offered on this instance yet."
                onSubmit={({ reason, idempotencyKey, values }) =>
                    changePlanAction(organizationId, {
                        reason,
                        idempotencyKey,
                        planId: values.planId ?? "",
                    })
                }
            />
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
                        trialAction(organizationId, {
                            reason,
                            idempotencyKey,
                            days: Number(values.days),
                            planId:
                                values.planId === ""
                                    ? undefined
                                    : values.planId,
                        })
                    }
                />
            )}
            {numericLimits.length > 0 && (
                <OperatorDialog
                    trigger="Raise a limit"
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
                                    {numericLimits.map((limit) => (
                                        <option
                                            key={limit.key}
                                            value={limit.key}
                                        >
                                            {camelToWords(limit.key)} (plan
                                            allows {limit.planValue})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="limit-value">
                                        New limit
                                    </Label>
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
                        raiseLimitAction(organizationId, {
                            reason,
                            idempotencyKey,
                            key: values.key ?? "",
                            value: Number(values.value),
                            days: Number(values.days),
                        })
                    }
                />
            )}
        </div>
    );
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
