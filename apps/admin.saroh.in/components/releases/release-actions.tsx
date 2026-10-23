"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { showError, showSuccess } from "@saroh/ui/toast";
import { MoreHorizontal } from "lucide-react";
import { useRef, useState } from "react";

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

type Opened = "some-on" | "some-off" | "global" | null;

/**
 * The changes a release manager makes to a release (R11). On its page:
 * Turn on for some…, Turn on for everyone… and ⋯ More actions (turning off,
 * copying the code name). On a row of the list (`layout="row"`): the same
 * changes, all in the row's ⋯ menu. Each opens its own dialog with its own
 * reason; only the changes that apply are offered.
 */
export function ReleaseActions({
    flag,
    organizations,
    layout = "header",
}: {
    flag: AdminFlag;
    organizations: AdminOrganization[];
    layout?: "header" | "row";
}) {
    const [opened, setOpened] = useState<Opened>(null);
    const rows = whoHasIt(flag, organizations);
    const withIt = rows.filter((row) => row.on);
    const without = rows.filter((row) => !row.on);
    const turnsOn = globalChange(flag);
    const name = flag.metadata.shownAs;
    const open = (which: Opened) => () => setOpened(which);
    const onOpenChange = (which: Opened) => (next: boolean) =>
        setOpened(next ? which : null);

    const header = layout === "header";
    const menu: { label: string; onSelect: () => void }[] = [
        ...(!header && without.length > 0
            ? [{ label: "Turn on for some…", onSelect: open("some-on") }]
            : []),
        ...(!header && turnsOn
            ? [{ label: "Turn on for everyone…", onSelect: open("global") }]
            : []),
        ...(withIt.length > 0
            ? [{ label: "Turn off for some…", onSelect: open("some-off") }]
            : []),
        ...(!turnsOn
            ? [{ label: "Turn off for everyone…", onSelect: open("global") }]
            : []),
        ...(header
            ? [{ label: "Copy code name", onSelect: () => copyKey(flag.key) }]
            : []),
    ];

    return (
        <div className="flex flex-wrap items-center gap-2">
            {header && without.length > 0 && (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={open("some-on")}
                >
                    Turn on for some…
                </Button>
            )}
            {header && turnsOn && (
                <Button type="button" size="sm" onClick={open("global")}>
                    Turn on for everyone…
                </Button>
            )}
            {menu.length > 0 && (
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            size={header ? "sm" : "icon"}
                            variant={header ? "outline" : "ghost"}
                            aria-label={
                                header
                                    ? "More actions"
                                    : `More actions for ${name}`
                            }
                        >
                            <MoreHorizontal className="size-4" aria-hidden />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        // A dialog opened from the menu takes the focus;
                        // handing it back to ⋯ would pull it out again.
                        onCloseAutoFocus={(event) => {
                            if (opened !== null) event.preventDefault();
                        }}
                    >
                        {menu.map((item) => (
                            <DropdownMenuItem
                                key={item.label}
                                onSelect={item.onSelect}
                            >
                                {item.label}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            <SomeBusinessesAction
                flag={flag}
                enabled
                candidates={without}
                open={opened === "some-on"}
                onOpenChange={onOpenChange("some-on")}
            />
            <SomeBusinessesAction
                flag={flag}
                enabled={false}
                candidates={withIt}
                open={opened === "some-off"}
                onOpenChange={onOpenChange("some-off")}
            />
            <GlobalAction
                flag={flag}
                organizations={organizations}
                open={opened === "global"}
                onOpenChange={onOpenChange("global")}
            />
        </div>
    );
}

function copyKey(key: string) {
    void navigator.clipboard
        .writeText(key)
        .then(() => showSuccess("Code name copied", key))
        .catch(() =>
            showError("Couldn't copy the code name", `Select it: ${key}`),
        );
}

interface Controlled {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function GlobalAction({
    flag,
    organizations,
    open,
    onOpenChange,
}: {
    flag: AdminFlag;
    organizations: AdminOrganization[];
} & Controlled) {
    const enabled = globalChange(flag);
    const feedback = useReleaseFeedback(flag);
    const name = flag.metadata.shownAs;
    const verb = enabled ? "on" : "off";
    return (
        <OperatorDialog
            open={open}
            onOpenChange={onOpenChange}
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
 * On (or off) for several businesses at once: a searchable checklist of
 * the businesses not already that way, one reason, one confirm. Each business
 * is its own request with its own idempotency key, kept for the attempt, so a
 * retry after a partial failure repeats the ones that worked harmlessly.
 */
export function SomeBusinessesAction({
    flag,
    enabled,
    candidates,
    open,
    onOpenChange,
}: {
    flag: AdminFlag;
    enabled: boolean;
    candidates: { organizationId: string; name: string }[];
} & Controlled) {
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
            open={open}
            onOpenChange={onOpenChange}
            title={`Turn ${name} ${verb} for some businesses`}
            effect={
                <p>
                    Each business you pick has it turned {verb} for it alone,
                    whatever the default for everyone becomes.
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
