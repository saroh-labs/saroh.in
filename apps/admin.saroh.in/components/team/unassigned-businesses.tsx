"use client";

import { Badge } from "@saroh/ui/badge";
import { showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useState } from "react";

import { ManagerActions } from "@/components/business/overview/manager-actions";
import { ChangedRow } from "@/components/changed-row";
import { OperatorDialog } from "@/components/operator-dialog";
import { formatDate, plural } from "@/lib/format";
import type { UnassignedBusiness } from "@/lib/staff";
import { shareOutAction } from "@/lib/team-actions";
import { useChangeFeedback } from "@/lib/use-change-feedback";

/** Paying first, then the oldest: the API's order, kept as rows change. */
function inOrder(a: UnassignedBusiness, b: UnassignedBusiness): number {
    return (
        Number(b.paying) - Number(a.paying) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.organizationId.localeCompare(b.organizationId)
    );
}

/**
 * Businesses without a manager (R30, admin console U17): paying ones
 * first, each with Assign… (the business Overview's picker, U25), and
 * Share out evenly… for the lot. Both need `accounts:assign`; staff who
 * may only see (`accounts:read`) get the list.
 *
 * A business just given a manager stays in its place, lit, saying who has
 * it now, until the operator leaves the screen: the list is not reshuffled
 * under their eyes. Nothing waiting is one line.
 */
export function UnassignedBusinesses({
    businesses,
    total,
    canAssign,
}: {
    businesses: UnassignedBusiness[];
    total: number;
    canAssign: boolean;
}) {
    const feedback = useChangeFeedback();
    // Given a manager here: kept, with who has it now.
    const [given, setGiven] = useState<
        ReadonlyMap<string, { row: UnassignedBusiness; manager: string }>
    >(() => new Map());

    const rows = [
        ...businesses.filter((b) => !given.has(b.organizationId)),
        ...[...given.values()].map((g) => g.row),
    ].sort(inOrder);

    return (
        <section
            id="unassigned"
            aria-labelledby="unassigned-title"
            className="grid gap-3 rounded-xl border bg-card p-4"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-0.5">
                    <h2 id="unassigned-title" className="font-semibold">
                        Businesses without a manager · {total}
                    </h2>
                    {total > 0 && (
                        <p className="text-[13px] text-muted-foreground">
                            Paying ones first.
                            {canAssign &&
                                " Give one to someone, or share them all out."}
                        </p>
                    )}
                </div>
                {canAssign && total > 0 && (
                    <OperatorDialog
                        trigger="Share out evenly…"
                        title="Share these businesses out evenly?"
                        effect={`Each of the ${plural(total, "business", "businesses")} without a manager goes, paying ones first, to an account manager on commission who looks after the fewest. Nobody is given more than they can take, or a business they own.`}
                        submitLabel="Share them out"
                        quickReasons={["New businesses to look after"]}
                        onSubmit={async ({ reason, idempotencyKey }) => {
                            const result = await shareOutAction({
                                reason,
                                idempotencyKey,
                            });
                            if (!result.ok) {
                                return { ok: false, error: result.error };
                            }
                            const shared = result.data.assigned.length;
                            const left = result.data.left;
                            showSuccess(
                                `${plural(shared, "business", "businesses")} shared out.`,
                                left > 0
                                    ? `${plural(left, "business", "businesses")} still without a manager: everyone else is full.`
                                    : "Kept with your name in the audit trail.",
                            );
                            return { ok: true };
                        }}
                    />
                )}
            </div>

            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Every business has a manager.
                </p>
            ) : (
                <ul aria-label="Businesses without a manager" className="grid">
                    {rows.map((business) => {
                        const now = given.get(business.organizationId);
                        return (
                            <ChangedRow
                                as="li"
                                key={business.organizationId}
                                changed={feedback.isHighlighted(
                                    business.organizationId,
                                )}
                                data-business={business.organizationId}
                                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b py-3 last:border-0"
                            >
                                <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
                                    <Link
                                        href={`/businesses/${encodeURIComponent(business.organizationId)}`}
                                        className="truncate text-sm font-medium hover:underline"
                                    >
                                        {business.name}
                                    </Link>
                                    <span className="text-[13px] text-muted-foreground">
                                        Joined {formatDate(business.createdAt)}
                                    </span>
                                </div>
                                <Badge
                                    variant={
                                        business.paying ? "success" : "neutral"
                                    }
                                >
                                    {business.paying
                                        ? "Pays Saroh"
                                        : "Not paying"}
                                </Badge>
                                {now ? (
                                    <span className="text-[13px] font-medium">
                                        Now with {now.manager}
                                    </span>
                                ) : canAssign ? (
                                    <ManagerActions
                                        organizationId={business.organizationId}
                                        manager={null}
                                        onDone={(message, manager) => {
                                            if (manager) {
                                                setGiven((before) =>
                                                    new Map(before).set(
                                                        business.organizationId,
                                                        {
                                                            row: business,
                                                            manager:
                                                                manager.name,
                                                        },
                                                    ),
                                                );
                                            }
                                            feedback.report({
                                                message,
                                                rowId: business.organizationId,
                                            });
                                        }}
                                    />
                                ) : null}
                            </ChangedRow>
                        );
                    })}
                </ul>
            )}
            {total > businesses.length && (
                <p className="text-[13px] text-muted-foreground">
                    Showing the first {businesses.length} of {total}. Share out
                    evenly takes them all.
                </p>
            )}
        </section>
    );
}
