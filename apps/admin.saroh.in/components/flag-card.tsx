"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent, CardHeader } from "@saroh/ui/card";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
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

    const reasonId = `reason-${flag.key}`;

    return (
        <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-mono text-sm font-medium">
                            {flag.key}
                        </h2>
                        {flag.enabledByDefault === null ? (
                            <Badge variant="outline">Never configured</Badge>
                        ) : flag.enabledByDefault ? (
                            <Badge className="bg-success/12 hover:bg-success/12 border border-success/30 text-success">
                                On
                            </Badge>
                        ) : (
                            <Badge variant="secondary">Off</Badge>
                        )}
                        {flag.overrides.length > 0 && (
                            <Badge className="bg-highlight-subtle text-highlight-subtle-foreground hover:bg-highlight-subtle">
                                {flag.overrides.length} override
                                {flag.overrides.length === 1 ? "" : "s"}
                            </Badge>
                        )}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        {flag.enabledByDefault === null
                            ? "No global row exists, so this flag resolves to off for everyone."
                            : "Organization overrides win over this global default."}
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
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
                    >
                        Enable globally
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
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
                    >
                        Disable globally
                    </Button>
                </div>
            </CardHeader>

            <CardContent>
                <div className="grid gap-1.5">
                    <Label htmlFor={reasonId}>
                        Reason (recorded against every change)
                    </Label>
                    <Input
                        id={reasonId}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. CRM beta for internal org"
                        disabled={pending || !canPublish}
                    />
                </div>

                {!canPublish && (
                    <p className="mt-2 text-xs text-muted-foreground">
                        Read-only: your role does not include release
                        publishing.
                    </p>
                )}

                {error && (
                    <p className="mt-2 text-sm text-destructive" role="alert">
                        {error}
                    </p>
                )}

                <div className="mt-5 border-t pt-4">
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
                                    <span className="flex min-w-0 items-center gap-2 truncate">
                                        <span className="truncate">
                                            {override.organizationName}
                                        </span>
                                        <Badge
                                            variant={
                                                override.enabled
                                                    ? "default"
                                                    : "secondary"
                                            }
                                        >
                                            {override.enabled ? "on" : "off"}
                                        </Badge>
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
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
                                    >
                                        Clear override
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {availableOrgs.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Select
                                value={targetOrg}
                                onValueChange={setTargetOrg}
                                disabled={pending || !canPublish}
                            >
                                <SelectTrigger
                                    className="w-[220px]"
                                    aria-label={`Add an override for ${flag.key}`}
                                >
                                    <SelectValue placeholder="Add override for…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableOrgs.map((org) => (
                                        <SelectItem key={org.id} value={org.id}>
                                            {org.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
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
                            >
                                Force on
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
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
                            >
                                Force off
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
