"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";

import { OperatorDialog } from "@/components/operator-dialog";
import {
    cancelPricingVersionAction,
    rollbackPricingVersionAction,
} from "@/lib/pricing-actions";
import type { AdminVersion } from "@/lib/pricing-types";

import { useFlash } from "../toast";
import {
    changesShown,
    onItLine,
    policyLine,
    STATUS_BADGE,
    STATUS_WORDS,
    syncLine,
    whenLine,
} from "./versions";

const ACTION = "h-[30px] rounded-[8px] px-3 text-[12.5px]";

/** One version in the history, with Cancel schedule or Roll back to this. */
export function VersionCard({
    version: v,
    nextV,
    canPublish,
    rollbackBlockedBy,
}: {
    version: AdminVersion;
    nextV: number;
    canPublish: boolean;
    /** Why rolling back can't happen now; null when it can. */
    rollbackBlockedBy: string | null;
}) {
    const flash = useFlash();
    const sync = syncLine(v);
    const canRoll = canPublish && v.status === "earlier";
    const canCancel = canPublish && v.status === "scheduled";

    return (
        <article
            aria-label={`Version ${v.version}`}
            className={cn(
                "grid gap-2 rounded-[12px] border bg-card px-4 py-3.5",
                v.status === "live" ? "border-border-strong" : "border-border",
            )}
        >
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                <h3 className="font-semibold">Version {v.version}</h3>
                <Badge
                    variant={STATUS_BADGE[v.status]}
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                >
                    {STATUS_WORDS[v.status]}
                </Badge>
                <span className="text-muted-foreground">{whenLine(v)}</span>
                <span className="text-[12px] text-muted-foreground">
                    {policyLine(v)}
                </span>
                {(canRoll || canCancel) && (
                    <span className="ml-auto flex gap-1.5">
                        {canRoll && (
                            <OperatorDialog
                                trigger="Roll back to this"
                                triggerClassName={ACTION}
                                disabled={rollbackBlockedBy !== null}
                                disabledReason={rollbackBlockedBy ?? undefined}
                                title={`Roll back to version ${v.version}?`}
                                effect={
                                    <p>
                                        This publishes version {v.version}
                                        &apos;s pricing again as version {nextV}
                                        . History stays. Businesses keep their
                                        current terms.
                                    </p>
                                }
                                submitLabel={`Publish as version ${nextV}`}
                                onSubmit={async ({
                                    reason,
                                    idempotencyKey,
                                }) => {
                                    const r =
                                        await rollbackPricingVersionAction(
                                            v.version,
                                            {
                                                note: `Rolled back to version ${v.version}`,
                                                reason,
                                                idempotencyKey,
                                            },
                                        );
                                    if (!r.ok)
                                        return { ok: false, error: r.error };
                                    flash(
                                        r.data.status === "waiting"
                                            ? `Version ${r.data.version} is waiting for billing`
                                            : `Version ${v.version}'s pricing is live again as version ${r.data.version}`,
                                    );
                                    return { ok: true };
                                }}
                            />
                        )}
                        {canCancel && (
                            <OperatorDialog
                                trigger="Cancel schedule"
                                triggerClassName={cn(
                                    ACTION,
                                    "text-destructive hover:text-destructive",
                                )}
                                title={`Cancel version ${v.version}?`}
                                effect={
                                    <p>
                                        Version {v.version} won&apos;t go live.
                                        {v.moving > 0
                                            ? ` The ${v.moving} businesses due to move to it stay where they are.`
                                            : ""}{" "}
                                        The live pricing stays as it is.
                                    </p>
                                }
                                submitLabel="Cancel schedule"
                                destructive
                                onSubmit={async ({
                                    reason,
                                    idempotencyKey,
                                }) => {
                                    const r = await cancelPricingVersionAction(
                                        v.version,
                                        { reason, idempotencyKey },
                                    );
                                    if (!r.ok)
                                        return { ok: false, error: r.error };
                                    flash(`Version ${v.version} won't go live`);
                                    return { ok: true };
                                }}
                            />
                        )}
                    </span>
                )}
            </div>
            {v.note && <p className="text-foreground/80">{v.note}</p>}
            <ul className="grid list-disc gap-[3px] pl-[18px] text-[12.5px] text-muted-foreground">
                {changesShown(v).map((c, i) => (
                    <li key={`${i}-${c}`}>{c}</li>
                ))}
                {v.changes.length > 6 && (
                    <li className="list-none">
                        and {v.changes.length - 6} more
                    </li>
                )}
            </ul>
            <p className="text-[12px] text-muted-foreground">
                {onItLine(v)}
                {sync && (
                    <span
                        className={cn(
                            "ml-3",
                            v.sync.failed > 0 && "text-destructive",
                        )}
                    >
                        {sync}
                    </span>
                )}
            </p>
        </article>
    );
}
