"use client";

import { DateInput } from "@saroh/ui/date-picker";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import {
    catalogueMoveAction,
    moduleOverrideAction,
    planOverrideAction,
    removeOverrideAction,
} from "@/lib/business-actions";
import type { BusinessCatalogue } from "@/lib/businesses";
import { formatDate, todayIso } from "@/lib/format";
import { endOfDayIso } from "@/lib/overrides";

import { OperatorDialog } from "../operator-dialog";
import { done } from "./plan-actions";

const selectClass =
    "h-[38px] w-full rounded-md border border-input bg-field px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11";

function ModuleSelect({
    id,
    modules,
}: {
    id: string;
    modules: { moduleId: string; name: string; note?: string }[];
}) {
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>Module</Label>
            <select id={id} name="moduleKey" className={selectClass} required>
                {modules.map((m) => (
                    <option key={m.moduleId} value={m.moduleId}>
                        {m.name}
                        {m.note ? ` (${m.note})` : ""}
                    </option>
                ))}
            </select>
        </div>
    );
}

function UntilField({
    id,
    required = false,
}: {
    id: string;
    required?: boolean;
}) {
    return (
        <div className="grid content-start gap-1.5">
            <Label htmlFor={id}>
                {required ? "Until" : "Until (optional)"}
            </Label>
            <DateInput
                id={id}
                className="w-full"
                name="until"
                min={todayIso()}
                required={required}
                clearable={!required}
                placeholder={required ? "Pick a date" : "No end date"}
            />
            {!required && (
                <p className="text-xs text-muted-foreground">
                    Leave empty and it lasts until someone removes it.
                </p>
            )}
        </div>
    );
}

/**
 * One business's exceptions to its catalogue plan (pricing U11): set a
 * limit up or down, a plan until a date, and a move to the live version.
 * Each goes through `OperatorDialog`, so each has a reason, and the API
 * checks, applies and records it. Grant a module and a custom price are
 * the offer sheet's now, and removing a module is Take away a module…
 * (admin plan U5): an offer is a gift, and taking away is a Platform
 * owner's alone.
 */
export function CatalogueActions({
    organizationId,
    catalogue,
    canMove,
}: {
    organizationId: string;
    catalogue: BusinessCatalogue;
    /** It has a catalogue subscription on an earlier version than the live one. */
    canMove: boolean;
}) {
    const on = catalogue.modules.filter((m) => m.state === "on");
    const limitable = on.filter((m) => m.limitable);
    const describe = (limit: number | null, per: string) =>
        limit === null ? "no limit" : `${limit}${per ? ` a ${per}` : ""}`;

    return (
        <div className="flex flex-wrap gap-2">
            <OperatorDialog
                trigger="Set a limit"
                title="Set a limit"
                effect="Up or down, for this business only. If it already has more than the new limit, what it has stays, read-only, and it can't add more until it is under."
                fields={
                    <>
                        <ModuleSelect
                            id="limit-module"
                            modules={limitable.map((m) => ({
                                ...m,
                                note: `now ${describe(m.limit, m.per)}${m.usage === null ? "" : `, ${m.usage} in use`}`,
                            }))}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid content-start gap-1.5">
                                <Label htmlFor="limit-set-value">
                                    New limit
                                </Label>
                                <Input
                                    id="limit-set-value"
                                    name="value"
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    required
                                />
                            </div>
                            <UntilField id="limit-set-until" />
                        </div>
                    </>
                }
                submitLabel="Set limit"
                disabled={limitable.length === 0}
                disabledReason="No module that is on has a limit."
                onSubmit={({ reason, idempotencyKey, values }) =>
                    moduleOverrideAction(organizationId, {
                        reason,
                        idempotencyKey,
                        kind: "limit",
                        moduleKey: values.moduleKey ?? "",
                        value: Number(values.value),
                        expiresAt: endOfDayIso(values.until ?? ""),
                    })
                }
            />
            <PlanOverrideDialog
                organizationId={organizationId}
                plans={catalogue.plans}
                current={catalogue.planOverride}
                defaultPlanId={catalogue.basePlanId}
            />
            {canMove && catalogue.liveVersion !== null && (
                <OperatorDialog
                    trigger={`Move to version ${catalogue.liveVersion}`}
                    title={`Move it to version ${catalogue.liveVersion}`}
                    effect={`It stays on the same plan, on the live version's terms. At its next renewal, it is told seven days ahead if anything changes for it, or 30 days ahead if its price changes; a new price waits for the business to approve it, and until then it keeps paying what it pays. Now applies at once, and is refused while a billing provider manages its subscription.`}
                    fields={
                        <fieldset className="grid gap-2">
                            <legend className="mb-1 text-sm font-medium">
                                When
                            </legend>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="radio"
                                    name="when"
                                    value="renewal"
                                    defaultChecked
                                />
                                At its next renewal, with notice
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="radio" name="when" value="now" />
                                Now
                            </label>
                        </fieldset>
                    }
                    submitLabel="Move"
                    onSubmit={({ reason, idempotencyKey, values }) =>
                        catalogueMoveAction(organizationId, {
                            reason,
                            idempotencyKey,
                            when: values.when === "now" ? "now" : "renewal",
                        })
                    }
                />
            )}
        </div>
    );
}

/** End one catalogue override now. */
export function RemoveOverride({
    organizationId,
    overrideId,
    label,
}: {
    organizationId: string;
    overrideId: string;
    label: string;
}) {
    return (
        <OperatorDialog
            trigger="Remove"
            triggerVariant="ghost"
            title={`Remove: ${label}`}
            effect="The business goes back to what its plan gives from the next request."
            submitLabel="Remove override"
            onSubmit={({ reason, idempotencyKey }) =>
                removeOverrideAction(organizationId, overrideId, {
                    reason,
                    idempotencyKey,
                })
            }
        />
    );
}

/**
 * Put the business on a catalogue plan until a date, or change the plan
 * override it has. A business the catalogue doesn't reach yet gets the live
 * version's plans: the API puts it on one of those.
 */
export function PlanOverrideDialog({
    organizationId,
    plans,
    current,
    defaultPlanId,
    trigger,
    onDone,
}: {
    organizationId: string;
    plans: { id: string; name: string }[];
    current: { planKey: string; expiresAt: string | null } | null;
    defaultPlanId: string;
    /** The button's words; "Put on a plan" or "Change plan override". */
    trigger?: string;
    /** After it went through: the screen's feedback (U3, R9). */
    onDone?: (message: string) => void;
}) {
    const nameOf = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
    return (
        <OperatorDialog
            trigger={
                trigger ?? (current ? "Change plan override" : "Put on a plan")
            }
            title={
                current
                    ? "Change or extend the plan override"
                    : "Put it on a plan until a date"
            }
            effect={
                current
                    ? `It is on ${nameOf(current.planKey)} until ${formatDate(current.expiresAt)}. Saving replaces that with the plan and date you choose.`
                    : "Whatever its subscription says, it gets this plan until the date you set, then goes back to its own. Its price doesn't change."
            }
            fields={
                <>
                    <div className="grid gap-1.5">
                        <Label htmlFor="plan-override-key">Plan</Label>
                        <select
                            id="plan-override-key"
                            name="planKey"
                            className={selectClass}
                            defaultValue={current?.planKey ?? defaultPlanId}
                            required
                        >
                            {plans.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <UntilField id="plan-override-until" required />
                </>
            }
            submitLabel="Save plan override"
            disabled={plans.length === 0}
            disabledReason="The live catalogue has no plan to put it on."
            onSubmit={({ reason, idempotencyKey, values }) =>
                // The date picker posts a hidden field, which the browser
                // doesn't check as required.
                !values.until
                    ? Promise.resolve({
                          ok: false as const,
                          error: "Pick the day it ends.",
                      })
                    : done(
                          planOverrideAction(organizationId, {
                              reason,
                              idempotencyKey,
                              planKey: values.planKey ?? "",
                              expiresAt: endOfDayIso(values.until) ?? "",
                          }),
                          onDone,
                          `On ${nameOf(values.planKey ?? "")} until ${formatDate(endOfDayIso(values.until) ?? null)}.`,
                      )
            }
        />
    );
}
