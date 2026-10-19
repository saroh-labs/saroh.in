"use client";

import { Button } from "@saroh/ui/button";
import { useEffect, useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import {
    assignManagerAction,
    endManagerAction,
    managerCandidatesAction,
} from "@/lib/account-manager-actions";
import type { ManagerCandidate, OverviewManager } from "@/lib/overview-words";
import { candidateLine } from "@/lib/overview-words";

const SELECT =
    "h-9 w-full rounded-md border border-input bg-field px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11";

type Open = "assign" | "change" | "end" | null;

/**
 * Assign…, Change… and End… for a business's account manager (DEC-169,
 * admin console U25), for staff with `accounts:assign`. Each is an
 * `OperatorDialog` (a reason, one idempotency key per opening), mounted
 * when it opens so the picker reads who can take the business then.
 */
export function ManagerActions({
    organizationId,
    manager,
    onDone,
}: {
    organizationId: string;
    manager: OverviewManager | null;
    /**
     * A change was saved: what to say, and who looks after it now (null
     * once ended), so a list can mark the row.
     */
    onDone: (message: string, now: OverviewManager | null) => void;
}) {
    const [open, setOpen] = useState<Open>(null);
    const close = (next: boolean) => {
        if (!next) setOpen(null);
    };

    return (
        <div className="flex flex-wrap gap-2">
            {manager ? (
                <>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setOpen("change")}
                    >
                        Change…
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setOpen("end")}
                    >
                        End…
                    </Button>
                </>
            ) : (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setOpen("assign")}
                >
                    Assign…
                </Button>
            )}

            {open === "assign" || open === "change" ? (
                <OperatorDialog
                    open
                    onOpenChange={close}
                    title={
                        manager
                            ? "Move this business to another account manager?"
                            : "Give this business an account manager?"
                    }
                    effect={moveEffect(manager)}
                    fields={
                        <ManagerPicker
                            organizationId={organizationId}
                            excluding={manager?.platformAdminId ?? null}
                        />
                    }
                    submitLabel={
                        manager
                            ? "Change account manager"
                            : "Assign account manager"
                    }
                    onSubmit={async ({ reason, idempotencyKey, values }) => {
                        const platformAdminId = values.platformAdminId ?? "";
                        if (!platformAdminId) {
                            return {
                                ok: false,
                                error: "Pick an account manager.",
                            };
                        }
                        const result = await assignManagerAction(
                            organizationId,
                            { platformAdminId, reason, idempotencyKey },
                        );
                        if (!result.ok) {
                            return { ok: false, error: result.error };
                        }
                        onDone(
                            `${result.data.manager.name} now looks after this business.`,
                            result.data.manager,
                        );
                        return { ok: true };
                    }}
                />
            ) : null}

            {open === "end" && manager ? (
                <OperatorDialog
                    open
                    onOpenChange={close}
                    title={`End ${manager.name}'s link?`}
                    effect={endEffect(manager)}
                    submitLabel="End the link"
                    destructive
                    onSubmit={async ({ reason, idempotencyKey }) => {
                        const result = await endManagerAction(organizationId, {
                            reason,
                            idempotencyKey,
                        });
                        if (!result.ok) {
                            return { ok: false, error: result.error };
                        }
                        onDone(
                            `${manager.name} no longer looks after this business.`,
                            null,
                        );
                        return { ok: true };
                    }}
                />
            ) : null}
        </div>
    );
}

/** What moving, or first giving, the business does. */
function moveEffect(manager: OverviewManager | null): string {
    if (!manager) {
        return "They look after it from now on, as given to them by Saroh's team.";
    }
    if (manager.kind === "BROUGHT_IN") {
        return `${manager.name} brought this business in. Moving it ends their link for good, and the new manager looks after it as given to them.`;
    }
    return `${manager.name} stops looking after it, and the new manager takes over as given to them.`;
}

/** What ending the link does. */
function endEffect(manager: OverviewManager): string {
    if (manager.kind === "BROUGHT_IN") {
        return `Nobody looks after this business until someone is given it. ${manager.name} brought it in, and that can't be given back.`;
    }
    return "Nobody looks after this business until someone is given it.";
}

type Candidates =
    | { state: "loading" }
    | { state: "failed"; error: string }
    | { state: "ready"; list: ManagerCandidate[] };

/**
 * Who the business can go to (R30): everyone holding the Account manager
 * role now, fewest businesses first, with their load against capacity.
 * The one who has it now isn't offered.
 */
function ManagerPicker({
    organizationId,
    excluding,
}: {
    organizationId: string;
    excluding: string | null;
}) {
    const [candidates, setCandidates] = useState<Candidates>({
        state: "loading",
    });

    useEffect(() => {
        let live = true;
        void managerCandidatesAction(organizationId).then((result) => {
            if (!live) return;
            setCandidates(
                result.ok
                    ? {
                          state: "ready",
                          list: result.data.filter(
                              (c) => c.platformAdminId !== excluding,
                          ),
                      }
                    : { state: "failed", error: result.error },
            );
        });
        return () => {
            live = false;
        };
    }, [organizationId, excluding]);

    if (candidates.state === "loading") {
        return (
            <p className="text-sm text-muted-foreground" role="status">
                Loading the account managers…
            </p>
        );
    }
    if (candidates.state === "failed") {
        return (
            <p className="text-sm text-destructive" role="alert">
                {candidates.error}
            </p>
        );
    }
    if (candidates.list.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                Nobody else holds the Account manager role. Give someone the
                role in Team first.
            </p>
        );
    }
    return (
        <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Account manager</span>
            <select name="platformAdminId" className={SELECT} required>
                {candidates.list.map((c) => (
                    <option key={c.platformAdminId} value={c.platformAdminId}>
                        {candidateLine(c)}
                    </option>
                ))}
            </select>
        </label>
    );
}
