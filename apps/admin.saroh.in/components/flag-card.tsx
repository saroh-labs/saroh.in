"use client";

import { useState, useTransition } from "react";

import type { AdminFlag, AdminOrganization } from "@/lib/control-plane";
import {
    clearFlagOverrideAction,
    setFlagOverrideAction,
    setGlobalFlagAction,
} from "@/lib/flag-actions";

/**
 * One flag's controls: the global default, and the per-Organization overrides
 * that deviate from it.
 *
 * Every mutation demands a typed reason before it will submit. That is not
 * ceremony — flags are how a rollout is steered, and a history of unexplained
 * boolean flips is close to useless in the incident review where you actually
 * read it. The API enforces the same rule, so this is a courtesy, not the gate.
 */
export function FlagCard({
    flag,
    organizations,
    canPublish,
}: {
    flag: AdminFlag;
    organizations: AdminOrganization[];
    canPublish: boolean;
}) {
    const [reason, setReason] = useState("");
    const [targetOrg, setTargetOrg] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const overriddenIds = new Set(
        flag.overrides.map((override) => override.organizationId),
    );
    const availableOrgs = organizations.filter(
        (org) => !overriddenIds.has(org.id),
    );
    const canSubmit = canPublish && reason.trim().length >= 4 && !pending;

    function run(action: () => Promise<{ ok: boolean; error?: string }>) {
        setError(null);
        startTransition(async () => {
            const result = await action();
            if (!result.ok) {
                setError(result.error ?? "Something went wrong.");
                return;
            }
            setReason("");
        });
    }

    return (
        <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-mono text-sm font-medium">
                        {flag.key}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {flag.enabledByDefault === null ? (
                            <>
                                Never configured — no global row exists, so this
                                flag resolves to <strong>off</strong> for
                                everyone.
                            </>
                        ) : (
                            <>
                                Global default:{" "}
                                <strong>
                                    {flag.enabledByDefault ? "on" : "off"}
                                </strong>
                            </>
                        )}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={() =>
                            run(() =>
                                setGlobalFlagAction(
                                    flag.key,
                                    true,
                                    reason,
                                    crypto.randomUUID(),
                                ),
                            )
                        }
                        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                        Enable globally
                    </button>
                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={() =>
                            run(() =>
                                setGlobalFlagAction(
                                    flag.key,
                                    false,
                                    reason,
                                    crypto.randomUUID(),
                                ),
                            )
                        }
                        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                        Disable globally
                    </button>
                </div>
            </div>

            <label className="mt-4 grid gap-1">
                <span className="text-xs font-medium">
                    Reason (recorded against every change)
                </span>
                <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. CRM beta for internal org"
                    disabled={pending}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                />
            </label>

            {!canPublish && (
                <p className="mt-2 text-xs text-muted-foreground">
                    Read-only: your role does not include release publishing.
                </p>
            )}

            {error && (
                <p className="mt-2 text-sm text-destructive" role="alert">
                    {error}
                </p>
            )}

            <div className="mt-4">
                <h3 className="text-xs font-medium">
                    Organization overrides ({flag.overrides.length})
                </h3>
                {flag.overrides.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                        Every organization follows the global default.
                    </p>
                ) : (
                    <ul className="mt-2 grid gap-2">
                        {flag.overrides.map((override) => (
                            <li
                                key={override.organizationId}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                            >
                                <span className="truncate">
                                    {override.organizationName}
                                    <span className="ml-2 text-xs text-muted-foreground">
                                        {override.enabled ? "on" : "off"}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    disabled={!canSubmit}
                                    onClick={() =>
                                        run(() =>
                                            clearFlagOverrideAction(
                                                flag.key,
                                                override.organizationId,
                                                reason,
                                                crypto.randomUUID(),
                                            ),
                                        )
                                    }
                                    className="text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                                >
                                    Clear override
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {availableOrgs.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select
                            value={targetOrg}
                            onChange={(e) => setTargetOrg(e.target.value)}
                            disabled={pending}
                            aria-label={`Add an override for ${flag.key}`}
                            className="rounded-md border bg-background px-2 py-1.5 text-sm"
                        >
                            <option value="">Add override for…</option>
                            {availableOrgs.map((org) => (
                                <option key={org.id} value={org.id}>
                                    {org.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            disabled={!canSubmit || !targetOrg}
                            onClick={() =>
                                run(() =>
                                    setFlagOverrideAction(
                                        flag.key,
                                        targetOrg,
                                        true,
                                        reason,
                                        crypto.randomUUID(),
                                    ),
                                )
                            }
                            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                        >
                            Force on
                        </button>
                        <button
                            type="button"
                            disabled={!canSubmit || !targetOrg}
                            onClick={() =>
                                run(() =>
                                    setFlagOverrideAction(
                                        flag.key,
                                        targetOrg,
                                        false,
                                        reason,
                                        crypto.randomUUID(),
                                    ),
                                )
                            }
                            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                        >
                            Force off
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
