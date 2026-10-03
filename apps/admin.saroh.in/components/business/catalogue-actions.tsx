"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import {
    catalogueMoveAction,
    moduleOverrideAction,
    planOverrideAction,
    priceOverrideAction,
    removeOverrideAction,
} from "@/lib/business-actions";
import type { BusinessCatalogue } from "@/lib/businesses";
import { formatDate, todayIso } from "@/lib/format";
import { endOfDayIso, rupeesToPaise } from "@/lib/overrides";

import { OperatorDialog } from "../operator-dialog";

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
            <Input
                id={id}
                name="until"
                type="date"
                min={todayIso()}
                required={required}
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
 * One business's exceptions to its catalogue plan (pricing U11): grant or
 * remove a module, set a limit, a custom price, a plan until a date, and a
 * move to the live version. Each goes through `OperatorDialog`, so each has
 * a reason, and the API checks, applies and records it.
 */
export function CatalogueActions({
    organizationId,
    catalogue,
    canSetPrice,
    canMove,
}: {
    organizationId: string;
    catalogue: BusinessCatalogue;
    /** `pricing:publish` too: a custom price is a price change. */
    canSetPrice: boolean;
    /** It has a catalogue subscription on an earlier version than the live one. */
    canMove: boolean;
}) {
    const off = catalogue.modules.filter((m) => m.state !== "on");
    const on = catalogue.modules.filter((m) => m.state === "on");
    const limitable = on.filter((m) => m.limitable);
    const describe = (limit: number | null, per: string) =>
        limit === null ? "no limit" : `${limit}${per ? ` a ${per}` : ""}`;

    return (
        <div className="flex flex-wrap gap-2">
            <OperatorDialog
                trigger="Grant a module"
                title="Grant a module"
                effect="The business gets this module whatever its plan says, until the date you set or until someone removes the override. With no limit."
                fields={
                    <>
                        <ModuleSelect
                            id="grant-module"
                            modules={off.map((m) => ({
                                ...m,
                                note: "not on its plan",
                            }))}
                        />
                        <UntilField id="grant-until" />
                    </>
                }
                submitLabel="Grant module"
                disabled={off.length === 0}
                disabledReason="Every module is already on."
                onSubmit={({ reason, idempotencyKey, values }) =>
                    moduleOverrideAction(organizationId, {
                        reason,
                        idempotencyKey,
                        kind: "grant",
                        moduleKey: values.moduleKey ?? "",
                        expiresAt: endOfDayIso(values.until ?? ""),
                    })
                }
            />
            <OperatorDialog
                trigger="Remove a module"
                title="Remove a module"
                effect="The module disappears from this business's workspace even though its plan includes it. Nothing is deleted; removing the override brings it back."
                fields={
                    <>
                        <ModuleSelect id="remove-module" modules={on} />
                        <UntilField id="remove-until" />
                    </>
                }
                submitLabel="Remove module"
                destructive
                disabled={on.length === 0}
                disabledReason="No module is on."
                onSubmit={({ reason, idempotencyKey, values }) =>
                    moduleOverrideAction(organizationId, {
                        reason,
                        idempotencyKey,
                        kind: "remove",
                        moduleKey: values.moduleKey ?? "",
                        expiresAt: endOfDayIso(values.until ?? ""),
                    })
                }
            />
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
            {canSetPrice && (
                <OperatorDialog
                    trigger="Custom price"
                    title="Set a custom price"
                    effect="What this business pays a month before GST, instead of its plan's price. Refused while a billing provider manages its subscription."
                    fields={
                        <>
                            <div className="grid gap-1.5">
                                <Label htmlFor="price-rupees">
                                    Price a month, before GST (₹)
                                </Label>
                                <Input
                                    id="price-rupees"
                                    name="rupees"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    required
                                />
                            </div>
                            <UntilField id="price-until" />
                        </>
                    }
                    submitLabel="Set price"
                    onSubmit={async ({ reason, idempotencyKey, values }) => {
                        const pricePaise = rupeesToPaise(values.rupees ?? "");
                        if (pricePaise === null) {
                            return {
                                ok: false,
                                error: "Write the price in rupees, like 1250 or 1250.50.",
                            };
                        }
                        return priceOverrideAction(organizationId, {
                            reason,
                            idempotencyKey,
                            pricePaise,
                            expiresAt: endOfDayIso(values.until ?? ""),
                        });
                    }}
                />
            )}
            <OperatorDialog
                trigger={
                    catalogue.planOverride
                        ? "Change plan override"
                        : "Put on a plan"
                }
                title={
                    catalogue.planOverride
                        ? "Change or extend the plan override"
                        : "Put it on a plan until a date"
                }
                effect={
                    catalogue.planOverride
                        ? `It is on ${planName(catalogue, catalogue.planOverride.planKey)} until ${formatDate(catalogue.planOverride.expiresAt)}. Saving replaces that with the plan and date you choose.`
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
                                defaultValue={
                                    catalogue.planOverride?.planKey ??
                                    catalogue.basePlanId
                                }
                                required
                            >
                                {catalogue.plans.map((p) => (
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
                onSubmit={({ reason, idempotencyKey, values }) =>
                    planOverrideAction(organizationId, {
                        reason,
                        idempotencyKey,
                        planKey: values.planKey ?? "",
                        expiresAt: endOfDayIso(values.until ?? "") ?? "",
                    })
                }
            />
            {canMove && catalogue.liveVersion !== null && (
                <OperatorDialog
                    trigger={`Move to version ${catalogue.liveVersion}`}
                    title={`Move it to version ${catalogue.liveVersion}`}
                    effect={`It stays on the same plan, on the live version's terms. At its next renewal, it is told seven days ahead if anything changes for it. Now applies at once, and is refused while a billing provider manages its subscription.`}
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

function planName(catalogue: BusinessCatalogue, planId: string): string {
    return catalogue.plans.find((p) => p.id === planId)?.name ?? planId;
}
