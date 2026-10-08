"use client";

import { useRef } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import type { AdminFlag, AdminOrganization } from "@/lib/control-plane";
import type { ReleaseChange } from "@/lib/releases";
import {
    globalChange,
    globalImpact,
    QUICK_REASONS,
    whoHasIt,
} from "@/lib/releases";

import { BusinessChecklist } from "./business-checklist";
import { applyChange, useReleaseFeedback } from "./use-release-change";

export const REASON_LABEL =
    "Why are you making this change? It's kept with your name in the audit trail.";

/**
 * The changes a release manager makes from the top of a release (R2, R5,
 * R7, R8): only the global change that applies, and on or off for some
 * businesses. Each opens its own dialog with its own reason.
 */
export function ReleaseActions({
    flag,
    organizations,
}: {
    flag: AdminFlag;
    organizations: AdminOrganization[];
}) {
    const rows = whoHasIt(flag, organizations);
    const withIt = rows.filter((row) => row.on);
    const without = rows.filter((row) => !row.on);
    return (
        <div className="flex flex-wrap items-start gap-2">
            {without.length > 0 && (
                <SomeBusinessesAction
                    flag={flag}
                    enabled
                    candidates={without}
                />
            )}
            {withIt.length > 0 && (
                <SomeBusinessesAction
                    flag={flag}
                    enabled={false}
                    candidates={withIt}
                />
            )}
            <GlobalAction flag={flag} organizations={organizations} />
        </div>
    );
}

export function GlobalAction({
    flag,
    organizations,
}: {
    flag: AdminFlag;
    organizations: AdminOrganization[];
}) {
    const enabled = globalChange(flag);
    const feedback = useReleaseFeedback(flag);
    const name = flag.metadata.shownAs;
    const verb = enabled ? "on" : "off";
    return (
        <OperatorDialog
            trigger={`Turn ${verb} for everyone…`}
            triggerVariant={enabled ? "default" : "outline"}
            title={`Turn ${name} ${verb} for everyone?`}
            effect={
                <div className="grid gap-2">
                    <p>{globalImpact(flag, organizations, enabled)}</p>
                    {enabled && flag.metadata.group === "module" && (
                        <p>
                            Each business still switches {name} on in its own
                            Settings.
                        </p>
                    )}
                </div>
            }
            submitLabel={`Turn ${verb} for everyone`}
            destructive={!enabled}
            quickReasons={QUICK_REASONS}
            reasonLabel={REASON_LABEL}
            onSubmit={async ({ reason, idempotencyKey }) => {
                const change: ReleaseChange = { kind: "global", enabled };
                const result = await applyChange(
                    flag.key,
                    change,
                    reason,
                    idempotencyKey,
                );
                if (result.ok) feedback([{ change, name: "everyone" }], reason);
                return result;
            }}
        />
    );
}

/**
 * On (or off) for several businesses at once (R8): a searchable checklist of
 * the businesses not already that way, one reason, one confirm. Each business
 * is its own request with its own idempotency key, kept for the attempt, so a
 * retry after a partial failure repeats the ones that worked harmlessly.
 */
export function SomeBusinessesAction({
    flag,
    enabled,
    candidates,
}: {
    flag: AdminFlag;
    enabled: boolean;
    candidates: { organizationId: string; name: string }[];
}) {
    const keys = useRef(new Map<string, string>());
    const feedback = useReleaseFeedback(flag);
    const name = flag.metadata.shownAs;
    const verb = enabled ? "on" : "off";

    function keyFor(attempt: string, organizationId: string): string {
        const id = `${attempt}:${organizationId}`;
        let key = keys.current.get(id);
        if (!key) {
            key = crypto.randomUUID();
            keys.current.set(id, key);
        }
        return key;
    }

    return (
        <OperatorDialog
            trigger={`Turn ${verb} for some businesses…`}
            title={`Turn ${name} ${verb} for some businesses`}
            effect={
                <p>
                    Each business you pick is set {verb} on its own, whatever
                    the default for everyone becomes.
                </p>
            }
            fields={
                <BusinessChecklist
                    name="organizationId"
                    options={candidates.map((row) => ({
                        id: row.organizationId,
                        name: row.name,
                    }))}
                />
            }
            submitLabel={`Turn ${verb}`}
            quickReasons={QUICK_REASONS}
            reasonLabel={REASON_LABEL}
            onSubmit={async ({ reason, idempotencyKey, form }) => {
                const ids = form
                    .getAll("organizationId")
                    .filter((v): v is string => typeof v === "string");
                if (ids.length === 0) {
                    return {
                        ok: false,
                        error: "Pick at least one business.",
                    };
                }
                const nameOf = new Map(
                    candidates.map((row) => [row.organizationId, row.name]),
                );
                const done: { change: ReleaseChange; name: string }[] = [];
                const failed: string[] = [];
                for (const organizationId of ids) {
                    const change: ReleaseChange = {
                        kind: "set",
                        organizationId,
                        enabled,
                    };
                    const result = await applyChange(
                        flag.key,
                        change,
                        reason,
                        keyFor(idempotencyKey, organizationId),
                    );
                    const label = nameOf.get(organizationId) ?? organizationId;
                    if (result.ok) done.push({ change, name: label });
                    else failed.push(`${label} (${result.error})`);
                }
                if (done.length > 0) feedback(done, reason);
                if (failed.length > 0) {
                    return {
                        ok: false,
                        error: `${done.length > 0 ? `Turned ${verb} for ${done.map((d) => d.name).join(", ")}. ` : ""}Didn't work for ${failed.join("; ")}. Try again to retry ${failed.length === 1 ? "it" : "them"}.`,
                    };
                }
                return { ok: true };
            }}
        />
    );
}
