"use client";

import { Button } from "@saroh/ui/button";
import { useEffect, useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { OwnRateDialog } from "@/components/team/own-rate-dialog";
import { endOwnRateAction, readOwnRateAction } from "@/lib/commission-actions";
import { rateLabel } from "@/lib/commission-words";
import type { OwnRateSummary } from "@/lib/own-rate-words";
import { ownRateLine } from "@/lib/own-rate-words";

type Open = "set" | "end" | null;

/**
 * A business's own commission rate on its Team card (DEC-169, #1035),
 * beside the account manager. Only for `team:pay` or `commission:rates`
 * holders: the line "Own rate N% from 10 Sep" (nobody else is sent it,
 * nor sees the number); with `commission:rates`, Set commission… and,
 * while one runs or is to come, End…. Read when the card shows it, again
 * after each write.
 */
export function OwnRateBlock({
    organizationId,
    canSet,
    onDone,
}: {
    organizationId: string;
    /** Holds `commission:rates`. */
    canSet: boolean;
    onDone: (message: string) => void;
}) {
    const [summary, setSummary] = useState<OwnRateSummary | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [open, setOpen] = useState<Open>(null);

    useEffect(() => {
        let live = true;
        void readOwnRateAction(organizationId).then((result) => {
            if (!live) return;
            if (result.ok) setSummary(result.data);
            else setFailed(result.error);
        });
        return () => {
            live = false;
        };
    }, [organizationId]);

    const rate = summary?.current ?? summary?.upcoming ?? null;
    const businessName = summary?.businessName ?? "this business";
    const close = (next: boolean) => {
        if (!next) setOpen(null);
    };

    return (
        <div className="grid gap-2" data-own-rate>
            {failed ? (
                <p className="text-[13px] text-muted-foreground">{failed}</p>
            ) : rate ? (
                <p className="text-[13px]">
                    {ownRateLine(rate, rateLabel(rate.basisPoints))}
                    {summary?.manager &&
                    summary.manager.platformAdminId !== rate.platformAdminId ? (
                        <span className="text-muted-foreground">
                            {" "}
                            · set for {rate.managerName}
                        </span>
                    ) : null}
                </p>
            ) : summary ? (
                <p className="text-[13px] text-muted-foreground">
                    Earns the general rate for its kind.
                </p>
            ) : null}
            {canSet && summary ? (
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setOpen("set")}
                    >
                        Set commission…
                    </Button>
                    {rate ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setOpen("end")}
                        >
                            End own rate…
                        </Button>
                    ) : null}
                </div>
            ) : null}

            {open === "set" ? (
                <OwnRateDialog
                    organizationId={organizationId}
                    businessName={businessName}
                    onOpenChange={close}
                    onSaved={(message, next) => {
                        setSummary(next);
                        onDone(message);
                    }}
                />
            ) : null}
            {open === "end" && rate ? (
                <OperatorDialog
                    open
                    onOpenChange={close}
                    title={`End ${businessName}'s own rate?`}
                    effect="From now on its payments earn the general rate for its kind. Payments it already priced keep their price. One not started yet never earns."
                    submitLabel="End own rate"
                    destructive
                    onSubmit={async ({ reason, idempotencyKey }) => {
                        const result = await endOwnRateAction(organizationId, {
                            reason,
                            idempotencyKey,
                        });
                        if (!result.ok) {
                            return { ok: false, error: result.error };
                        }
                        setSummary(result.data);
                        onDone(`${businessName}'s own rate has ended.`);
                        return { ok: true };
                    }}
                />
            ) : null}
        </div>
    );
}
