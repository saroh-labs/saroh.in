"use client";

import { DateInput, isoFromDate } from "@saroh/ui/date-picker";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { setCommissionRateAction } from "@/lib/commission-actions";
import type { RateKind, RatesView, RateView } from "@/lib/commission-words";
import {
    KIND_HINT,
    KIND_LABEL,
    percentToBasisPoints,
    RATE_KINDS,
    rateLabel,
} from "@/lib/commission-words";
import { formatDate } from "@/lib/format";

/**
 * Commission rates (DEC-169, admin console U21), for a Platform owner
 * (`commission:rates`). Shows the rate in force for each kind of link,
 * any set to start later and every one ever set, newest first. Set a
 * rate… is an `OperatorDialog`: the kind, a percentage and, if not today,
 * the day it starts. A rate applies to payments from its start; a payment
 * already earned keeps the rate it was worked out with. The rates live
 * only in the database: nothing here has a default.
 */
export function RatesSheet({
    rates: initial,
    open,
    onOpenChange,
    onSaved,
}: {
    rates: RatesView;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved?: () => void;
}) {
    const [rates, setRates] = useState(initial);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle>Commission rates</SheetTitle>
                    <SheetDescription>
                        What an account manager earns on each payment before
                        GST. A new rate applies to payments from the day it
                        starts; payments already earned keep theirs.
                    </SheetDescription>
                </SheetHeader>

                <div className="grid gap-4 px-4 pb-6">
                    <dl className="grid gap-3">
                        {RATE_KINDS.map((kind) => (
                            <div key={kind} className="rounded-md border p-3">
                                <dt className="text-sm font-medium">
                                    {KIND_LABEL[kind]}
                                </dt>
                                <dd className="text-lg font-semibold tabular-nums">
                                    {rates.current[kind]
                                        ? rateLabel(
                                              rates.current[kind].basisPoints,
                                          )
                                        : "Not set"}
                                </dd>
                                <dd className="text-[13px] text-muted-foreground">
                                    {rates.current[kind]
                                        ? `Since ${formatDate(rates.current[kind].effectiveFrom)}`
                                        : "Payments of this kind wait, earning nothing yet, until a rate is set."}
                                </dd>
                                <dd className="text-[13px] text-muted-foreground">
                                    {KIND_HINT[kind]}
                                </dd>
                            </div>
                        ))}
                    </dl>

                    {rates.upcoming.length > 0 ? (
                        <div className="grid gap-1">
                            <h3 className="text-sm font-medium">
                                Starting later
                            </h3>
                            <RateList rows={rates.upcoming} />
                        </div>
                    ) : null}

                    <OperatorDialog
                        trigger="Set a rate…"
                        triggerVariant="default"
                        title="Set a commission rate?"
                        effect="Payments from the day it starts earn at this rate. Payments already earned keep the rate they were worked out with, and any waiting for a rate are worked out now."
                        fields={<RateFields />}
                        submitLabel="Set rate"
                        onSubmit={async ({
                            reason,
                            idempotencyKey,
                            values,
                        }) => {
                            const kind = values.kind as RateKind | undefined;
                            if (!kind || !RATE_KINDS.includes(kind)) {
                                return {
                                    ok: false,
                                    error: "Pick which businesses it is for.",
                                };
                            }
                            const basisPoints = percentToBasisPoints(
                                values.percent ?? "",
                            );
                            if (basisPoints === null) {
                                return {
                                    ok: false,
                                    error: "Give a percentage from 0 to 100, with up to two decimals.",
                                };
                            }
                            const from = values.startsOn?.trim();
                            const result = await setCommissionRateAction({
                                kind,
                                basisPoints,
                                ...(from && from !== isoFromDate(new Date())
                                    ? {
                                          effectiveFrom: new Date(
                                              `${from}T00:00:00+05:30`,
                                          ).toISOString(),
                                      }
                                    : {}),
                                reason,
                                idempotencyKey,
                            });
                            if (!result.ok)
                                return { ok: false, error: result.error };
                            setRates(result.data);
                            showSuccess(
                                `${KIND_LABEL[kind]} rate set to ${rateLabel(basisPoints)}.`,
                            );
                            onSaved?.();
                            return { ok: true };
                        }}
                    />

                    <div className="grid gap-1">
                        <h3 className="text-sm font-medium">Every rate set</h3>
                        {rates.history.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No rate has been set yet.
                            </p>
                        ) : (
                            <RateList rows={rates.history} />
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function RateList({ rows }: { rows: RateView[] }) {
    return (
        <ul className="grid gap-1.5">
            {rows.map((r) => (
                <li key={r.id} className="text-sm">
                    <span className="font-medium">
                        {KIND_LABEL[r.kind]} · {rateLabel(r.basisPoints)}
                    </span>{" "}
                    <span className="text-muted-foreground">
                        from {formatDate(r.effectiveFrom)}, set by {r.setByName}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                        {r.reason}
                    </span>
                </li>
            ))}
        </ul>
    );
}

function RateFields() {
    return (
        <div className="grid gap-3">
            <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">For</legend>
                {RATE_KINDS.map((kind) => (
                    <label
                        key={kind}
                        className="flex items-start gap-2.5 text-sm coarse:min-h-11"
                    >
                        <input
                            type="radio"
                            name="kind"
                            value={kind}
                            required
                            className="mt-0.5 size-4 accent-foreground"
                        />
                        <span>
                            <span className="font-medium">
                                {KIND_LABEL[kind]}
                            </span>
                            <span className="block text-[13px] text-muted-foreground">
                                {KIND_HINT[kind]}
                            </span>
                        </span>
                    </label>
                ))}
            </fieldset>
            <div className="grid gap-1.5">
                <Label htmlFor="commission-percent">Rate (%)</Label>
                <Input
                    id="commission-percent"
                    name="percent"
                    inputMode="decimal"
                    autoComplete="off"
                    required
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="commission-starts">Starts on (optional)</Label>
                <DateInput
                    id="commission-starts"
                    name="startsOn"
                    className="w-full"
                    min={isoFromDate(new Date())}
                    clearable
                    placeholder="Today"
                />
            </div>
        </div>
    );
}
