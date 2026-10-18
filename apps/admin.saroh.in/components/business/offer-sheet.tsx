"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { useId, useState, useTransition } from "react";

import {
    moduleOverrideAction,
    planOverrideAction,
    priceOverrideAction,
    raiseLimitAction,
    trialAction,
} from "@/lib/business-actions";
import { formatDate, todayIso } from "@/lib/format";
import type {
    OfferFields,
    OfferKind,
    OfferOptions,
    OfferPreview,
} from "@/lib/offer-words";
import {
    confirmLabel,
    doneMessage,
    draftFrom,
    EMPTY_FIELDS,
    KIND_CARD,
    rowForRegistry,
    shownKinds,
} from "@/lib/offer-words";

import {
    ReasonField,
    selectClass,
    useAttemptKey,
    useOfferOptions,
    useOfferPreview,
    WhatTheyllSee,
} from "./offer-parts";

/** How the sheet is opened: from the header, or prefilled from a row. */
export interface OfferStart {
    kind?: OfferKind;
    /** "Give this module…": the registry module the row is (`APPOINTMENTS`). */
    registry?: string;
}

/**
 * Give a custom offer (admin plan U5, R5): a side sheet over the page.
 * Offers are gifts only — a plan until a date, a custom price, one
 * module, a higher limit, or a longer trial (shown only while they are in
 * one). Each kind has its end date where it applies and a reason, and
 * "What they'll see" is the API's own dry run of it
 * (`POST …/overrides/preview`, which writes nothing), checked again as the
 * operator types. The confirm button names the action ("Give Plan C until
 * 31 Dec 2026") and stays off until the dry run passes and the reason has
 * four characters.
 *
 * A kind the operator may not give, or that doesn't apply to this
 * business, shows disabled with the API's reason (a custom price without
 * `pricing:publish`, one billed through a provider). Mount it when it
 * opens: each opening is a fresh attempt.
 */
export function OfferSheet({
    organizationId,
    businessName,
    start,
    onOpenChange,
    onDone,
    checkDelayMs = 350,
}: {
    organizationId: string;
    businessName: string;
    start?: OfferStart;
    onOpenChange: (open: boolean) => void;
    /** After it went through: the caller's toast and highlight. */
    onDone?: (message: string) => void;
    /** How long after the last keystroke the dry run runs. */
    checkDelayMs?: number;
}) {
    const options = useOfferOptions(organizationId);
    return (
        <Sheet open onOpenChange={onOpenChange}>
            <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
                <SheetHeader className="border-b px-6 pb-3.5 pt-5 text-left">
                    <SheetTitle>Give a custom offer</SheetTitle>
                    <SheetDescription>
                        {options.status === "ok" && options.data.planName
                            ? `${businessName} · on ${options.data.planName}`
                            : businessName}
                    </SheetDescription>
                </SheetHeader>
                {options.status === "loading" ? (
                    <p className="px-6 py-5 text-sm text-muted-foreground">
                        Loading what can be offered…
                    </p>
                ) : options.status === "failed" ? (
                    <p
                        className="px-6 py-5 text-sm text-destructive"
                        role="alert"
                    >
                        {options.error}
                    </p>
                ) : (
                    <OfferForm
                        organizationId={organizationId}
                        businessName={businessName}
                        options={options.data}
                        start={start}
                        onClose={() => onOpenChange(false)}
                        onDone={onDone}
                        checkDelayMs={checkDelayMs}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
}

function firstFields(options: OfferOptions, start?: OfferStart): OfferFields {
    const offPlan = options.plans.find((p) => p.name !== options.planName);
    return {
        ...EMPTY_FIELDS,
        planKey: (offPlan ?? options.plans.at(0))?.id ?? "",
        moduleKey:
            (start?.registry
                ? rowForRegistry(options, start.registry)
                : null) ??
            options.modules.find((m) => m.state !== "on")?.id ??
            "",
        limitKey: options.limits.at(0)?.key ?? "",
    };
}

function firstKind(options: OfferOptions, start?: OfferStart): OfferKind {
    const kinds = shownKinds(options);
    if (start?.kind && kinds.includes(start.kind)) return start.kind;
    return kinds.find((k) => options.kinds[k].available) ?? "plan";
}

function OfferForm({
    organizationId,
    businessName,
    options,
    start,
    onClose,
    onDone,
    checkDelayMs,
}: {
    organizationId: string;
    businessName: string;
    options: OfferOptions;
    start?: OfferStart;
    onClose: () => void;
    onDone?: (message: string) => void;
    checkDelayMs: number;
}) {
    const id = useId();
    const [kind, setKind] = useState<OfferKind>(() =>
        firstKind(options, start),
    );
    const [fields, setFields] = useState<OfferFields>(() =>
        firstFields(options, start),
    );
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const attemptKey = useAttemptKey();

    const available = options.kinds[kind].available;
    const parsed = available
        ? draftFrom(kind, fields)
        : { draft: null, error: options.kinds[kind].why };
    const { state, draftKey } = useOfferPreview(
        organizationId,
        parsed,
        checkDelayMs,
    );
    const preview = state.status === "ok" ? state.preview : null;
    const ready = preview !== null && reason.trim().length >= 4 && !pending;

    const set = (patch: Partial<OfferFields>) => {
        setError(null);
        setFields((now) => ({ ...now, ...patch }));
    };

    function confirm(p: OfferPreview) {
        const idempotencyKey = attemptKey(draftKey);
        const input = { reason: reason.trim(), idempotencyKey };
        const d = parsed.draft;
        if (!d) return;
        setError(null);
        startTransition(async () => {
            const result = await write(organizationId, p, d, input);
            if (!result.ok) {
                setError(result.error ?? "That did not work. Nothing changed.");
                return;
            }
            onDone?.(doneMessage(p, businessName));
            onClose();
        });
    }

    return (
        <form
            className="flex flex-1 flex-col"
            onSubmit={(event) => {
                event.preventDefault();
                if (preview && ready) confirm(preview);
            }}
        >
            <div className="grid flex-1 content-start gap-5 px-6 py-5">
                <fieldset className="grid gap-2">
                    <legend className="mb-2 text-sm font-semibold">
                        What do you want to give them?
                    </legend>
                    {shownKinds(options).map((k) => {
                        const option = options.kinds[k];
                        return (
                            <div key={k} className="grid gap-1">
                                <button
                                    type="button"
                                    aria-pressed={kind === k}
                                    disabled={pending}
                                    onClick={() => {
                                        setError(null);
                                        setKind(k);
                                    }}
                                    data-offer-kind={k}
                                    className={cn(
                                        "grid gap-0.5 rounded-lg border px-3.5 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        kind === k
                                            ? "border-primary bg-muted"
                                            : "border-border hover:bg-muted/60",
                                        !option.available && "opacity-70",
                                    )}
                                >
                                    <span className="font-semibold">
                                        {KIND_CARD[k].title}
                                    </span>
                                    <span className="text-[13px] text-muted-foreground">
                                        {option.available
                                            ? KIND_CARD[k].note
                                            : option.why}
                                    </span>
                                </button>
                            </div>
                        );
                    })}
                </fieldset>

                {available && (
                    <KindFields
                        id={id}
                        kind={kind}
                        options={options}
                        fields={fields}
                        set={set}
                        disabled={pending}
                    />
                )}

                <ReasonField
                    id={`${id}-reason`}
                    value={reason}
                    onChange={setReason}
                    disabled={pending}
                />

                <WhatTheyllSee state={state} />

                {error && (
                    <p className="text-sm text-destructive" role="alert">
                        {error}
                    </p>
                )}
            </div>
            <SheetFooter className="flex-row flex-wrap justify-end gap-2.5 border-t px-6 py-3.5">
                <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={pending}
                >
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready}>
                    {pending
                        ? "Working…"
                        : preview
                          ? confirmLabel(preview)
                          : "Give the offer"}
                </Button>
            </SheetFooter>
        </form>
    );
}

/** Each kind's own fields. Dates are India's day; amounts are rupees. */
function KindFields({
    id,
    kind,
    options,
    fields,
    set,
    disabled,
}: {
    id: string;
    kind: OfferKind;
    options: OfferOptions;
    fields: OfferFields;
    set: (patch: Partial<OfferFields>) => void;
    disabled: boolean;
}) {
    const until = (label: string, hint?: string) => (
        <div className="grid gap-1.5">
            <Label htmlFor={`${id}-until`}>{label}</Label>
            <Input
                id={`${id}-until`}
                type="date"
                min={todayIso()}
                value={fields.until}
                onChange={(e) => set({ until: e.target.value })}
                disabled={disabled}
            />
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );

    switch (kind) {
        case "plan":
            return (
                <div className="grid gap-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-plan`}>Plan</Label>
                        <select
                            id={`${id}-plan`}
                            className={selectClass}
                            value={fields.planKey}
                            onChange={(e) => set({ planKey: e.target.value })}
                            disabled={disabled}
                        >
                            {options.plans.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {until("Until")}
                </div>
            );
        case "price":
            return (
                <div className="grid gap-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-price`}>
                            Their price a month, before GST (₹)
                        </Label>
                        <Input
                            id={`${id}-price`}
                            inputMode="decimal"
                            autoComplete="off"
                            value={fields.rupees}
                            onChange={(e) => set({ rupees: e.target.value })}
                            disabled={disabled}
                        />
                    </div>
                    {until(
                        "Until (optional)",
                        "Leave it empty and it lasts until someone removes it.",
                    )}
                </div>
            );
        case "module": {
            const off = options.modules.filter((m) => m.state !== "on");
            return (
                <div className="grid gap-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-module`}>Module</Label>
                        <select
                            id={`${id}-module`}
                            className={selectClass}
                            value={fields.moduleKey}
                            onChange={(e) => set({ moduleKey: e.target.value })}
                            disabled={disabled}
                        >
                            {off.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.name} (not in their plan)
                                </option>
                            ))}
                        </select>
                    </div>
                    {until(
                        "Until (optional)",
                        "Leave it empty and it lasts until someone removes it.",
                    )}
                </div>
            );
        }
        case "limit": {
            const chosen = options.limits.find(
                (l) => l.key === fields.limitKey,
            );
            return (
                <div className="grid gap-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-limit`}>Limit</Label>
                        <select
                            id={`${id}-limit`}
                            className={selectClass}
                            value={fields.limitKey}
                            onChange={(e) => set({ limitKey: e.target.value })}
                            disabled={disabled}
                        >
                            {options.limits.map((l) => (
                                <option key={l.key} value={l.key}>
                                    {l.label} (their plan gives {l.planLimit})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-value`}>New limit</Label>
                        <Input
                            id={`${id}-value`}
                            type="number"
                            inputMode="numeric"
                            min={chosen ? chosen.planLimit + 1 : 1}
                            value={fields.value}
                            onChange={(e) => set({ value: e.target.value })}
                            disabled={disabled}
                        />
                    </div>
                    {until(
                        "Until",
                        `At most ${options.raiseMaxDays} days from today.`,
                    )}
                </div>
            );
        }
        case "trial":
            return until(
                "Their trial ends on",
                options.trialEndsAt
                    ? `It ends ${formatDate(options.trialEndsAt)} now; up to ${options.trialMaxDays} days more.`
                    : undefined,
            );
    }
}

/** The write the dry run checked: the existing route for its kind. */
async function write(
    organizationId: string,
    preview: OfferPreview,
    draft: NonNullable<ReturnType<typeof draftFrom>["draft"]>,
    input: { reason: string; idempotencyKey: string },
): Promise<{ ok: boolean; error?: string }> {
    switch (draft.kind) {
        case "plan":
            return planOverrideAction(organizationId, {
                ...input,
                planKey: draft.planKey ?? "",
                expiresAt: draft.expiresAt ?? "",
            });
        case "price":
            return priceOverrideAction(organizationId, {
                ...input,
                pricePaise: draft.pricePaise ?? 0,
                expiresAt: draft.expiresAt,
            });
        case "module":
            return moduleOverrideAction(organizationId, {
                ...input,
                kind: "grant",
                moduleKey: draft.moduleKey ?? "",
                expiresAt: draft.expiresAt,
            });
        case "limit":
            return raiseLimitAction(organizationId, {
                ...input,
                key: draft.moduleKey ?? "",
                value: draft.value ?? 0,
                days: preview.days ?? 0,
            });
        case "trial":
            return trialAction(organizationId, {
                ...input,
                days: preview.days ?? 0,
            });
        case "remove":
            return { ok: false, error: "Taking a module away isn't an offer." };
    }
}
