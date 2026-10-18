"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { useState } from "react";

import { ModuleToggle } from "@/components/business/module-actions";
import { ChangedRow } from "@/components/changed-row";
import { EmptyPanel } from "@/components/states/empty-panel";
import {
    moduleReleaseAction,
    switchOnModuleAction,
} from "@/lib/business-actions";
import type {
    BusinessModulesState,
    BusinessModuleState,
} from "@/lib/businesses";
import type { AdminPermission } from "@/lib/control-plane";
import { dependencyWords, missingAccess, STATE_PILL } from "@/lib/module-fix";
import { undoReason } from "@/lib/releases";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { OfferSheet } from "../offer-sheet";
import { FixSheet } from "./fix-sheet";

/** A module their plan doesn't include: the offer sheet, prefilled (U5). */
export const GIVE_MODULE = "Give this module…";

/**
 * The Modules tab's rows (admin plan U4, R3): one per module, with its
 * true state as a pill, the reason in words, what it works with (as
 * information, never a gate) and the one fix for the gate in its way. A
 * fix opens its sheet, one at a time; after it the row flips to the state
 * the API reads back, lights for two seconds, and a release turned on for
 * this business offers Undo (R9).
 *
 * A module their plan doesn't include offers Give this module…, the
 * offer sheet (U5) opened on One module with this module picked; after it
 * the row lights the same way.
 *
 * Their own switch stays on each row for operators who may change it
 * (`organization:modules:write`): Turn off where it is on, Turn on where
 * the fix is something else, so nothing the tab had before is lost.
 */
export function ModuleRows({
    organizationId,
    businessName,
    state,
    permissions,
    switches = {},
    priorOverrides = {},
}: {
    organizationId: string;
    businessName: string;
    state: BusinessModulesState;
    /** The operator's permissions; a fix they lack shows disabled, saying why. */
    permissions: readonly AdminPermission[];
    /**
     * Their own switch per module, when the support session let it be read
     * (`true` on). A module missing here is worked out from its state.
     */
    switches?: Partial<Record<string, boolean>>;
    /**
     * This business's own setting for each release before any change, when
     * Releases could be read: `null` for none (it follows the default).
     * Undo puts it back; unknown, Undo turns the release back off.
     */
    priorOverrides?: Partial<Record<string, boolean | null>>;
}) {
    const feedback = useChangeFeedback();
    const [openKey, setOpenKey] = useState<string | null>(null);
    // "Give this module…": the row whose module the offer sheet gives.
    const [givingKey, setGivingKey] = useState<string | null>(null);
    // Rows as the API read them back after a fix, until the page's own
    // refresh brings a new state.
    const [fixed, setFixed] = useState<Record<string, BusinessModuleState>>({});
    const [seen, setSeen] = useState(state);
    if (seen !== state) {
        setSeen(state);
        setFixed({});
    }

    const rows = state.modules.map((row) => fixed[row.moduleKey] ?? row);
    const may = (permission?: AdminPermission) =>
        permission === undefined || permissions.includes(permission);
    const modulesWrite = may("organization:modules:write");
    const open = rows.find((row) => row.moduleKey === openKey) ?? null;
    const giving = rows.find((row) => row.moduleKey === givingKey) ?? null;

    function flip(moduleKey: string, row: BusinessModuleState | null) {
        if (row) setFixed((now) => ({ ...now, [moduleKey]: row }));
    }

    async function fixRow(
        row: BusinessModuleState,
        input: { reason: string; idempotencyKey: string },
    ): Promise<{ ok: boolean; error?: string }> {
        const fix = row.fix;
        if (fix?.kind === "release" && fix.flagKey) {
            const flagKey = fix.flagKey;
            const result = await moduleReleaseAction(
                organizationId,
                row.moduleKey,
                flagKey,
                { ...input, enabled: true },
            );
            if (!result.ok) return result;
            flip(row.moduleKey, result.data.row);
            // What this business had before; unknown, turn it back off.
            const prior = priorOverrides[flagKey];
            const back = prior === undefined ? false : prior;
            feedback.report({
                rowId: row.moduleKey,
                message: `${row.label} is on for ${businessName}`,
                undo: async () => {
                    const undone = await moduleReleaseAction(
                        organizationId,
                        row.moduleKey,
                        flagKey,
                        {
                            reason: undoReason(input.reason),
                            idempotencyKey: crypto.randomUUID(),
                            enabled: back,
                        },
                    );
                    if (!undone.ok) return { ok: false };
                    flip(row.moduleKey, undone.data.row ?? row);
                    return { ok: true };
                },
            });
            return { ok: true };
        }
        if (fix?.kind === "switch-on") {
            const result = await switchOnModuleAction(
                organizationId,
                row.moduleKey,
                input,
            );
            if (!result.ok) return result;
            flip(row.moduleKey, result.data.row);
            feedback.report({
                rowId: row.moduleKey,
                message: `${row.label} is switched on for ${businessName}`,
            });
            return { ok: true };
        }
        return { ok: false, error: "There is nothing to change here." };
    }

    if (rows.length === 0) {
        return (
            <EmptyPanel
                title="No modules to show"
                description="Saroh has no module rolled out for businesses yet."
            />
        );
    }

    return (
        <div className="grid gap-3">
            {state.note && (
                <Notice tone="neutral" data-plan-note>
                    {state.note}. A module outside their plan still works for
                    them.
                </Notice>
            )}
            <ul className="grid divide-y divide-border">
                {rows.map((row) => {
                    const pill = STATE_PILL[row.state];
                    const deps = dependencyWords(row);
                    const switchedOn =
                        switches[row.moduleKey] ?? switchFromState(row);
                    return (
                        <ChangedRow
                            as="li"
                            key={row.moduleKey}
                            changed={feedback.isHighlighted(row.moduleKey)}
                            data-module={row.moduleKey}
                            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                            <div className="grid min-w-0 gap-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium">
                                        {row.label}
                                    </p>
                                    <Badge size="sm" variant={pill.variant}>
                                        {pill.label}
                                    </Badge>
                                </div>
                                {row.reason && (
                                    <p className="text-[13px] text-muted-foreground">
                                        {row.reason}
                                    </p>
                                )}
                                {deps && (
                                    <p
                                        className="text-xs text-muted-foreground"
                                        data-dependencies
                                    >
                                        {deps}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                                <FixControl
                                    row={row}
                                    allowed={may(row.fix?.permission)}
                                    onOpen={() =>
                                        row.fix?.kind === "plan"
                                            ? setGivingKey(row.moduleKey)
                                            : setOpenKey(row.moduleKey)
                                    }
                                />
                                {modulesWrite &&
                                    switchedOn !== undefined &&
                                    !(
                                        !switchedOn &&
                                        row.fix?.kind === "switch-on"
                                    ) && (
                                        <ModuleToggle
                                            organizationId={organizationId}
                                            moduleKey={row.moduleKey}
                                            label={row.label}
                                            enabled={switchedOn}
                                        />
                                    )}
                            </div>
                        </ChangedRow>
                    );
                })}
            </ul>
            {giving && (
                <OfferSheet
                    key={giving.moduleKey}
                    organizationId={organizationId}
                    businessName={businessName}
                    start={{ kind: "module", registry: giving.moduleKey }}
                    onOpenChange={(next) => {
                        if (!next) setGivingKey(null);
                    }}
                    onDone={(message) =>
                        feedback.report({ message, rowId: giving.moduleKey })
                    }
                />
            )}
            {open && (
                <FixSheet
                    key={open.moduleKey}
                    row={open}
                    businessName={businessName}
                    onOpenChange={(next) => {
                        if (!next) setOpenKey(null);
                    }}
                    onFix={(input) => fixRow(open, input)}
                />
            )}
        </div>
    );
}

/**
 * Their own switch, from the state, when the session didn't read it: a
 * module past the switch gate has it on; one stopped at it has it off;
 * one stopped before it (its release) can't tell.
 */
function switchFromState(row: BusinessModuleState): boolean | undefined {
    if (row.blocker === "ORG_MODULE_DISABLED") return false;
    if (row.state === "on" || row.blocker === "ENTITLEMENT_REQUIRED") {
        return true;
    }
    return undefined;
}

/** The row's one fix: a button opening its sheet, or nothing. */
function FixControl({
    row,
    allowed,
    onOpen,
}: {
    row: BusinessModuleState;
    allowed: boolean;
    onOpen: () => void;
}) {
    const fix = row.fix;
    if (!fix) return null;

    if (!allowed && fix.permission) {
        const label = fix.kind === "plan" ? GIVE_MODULE : fix.label;
        return (
            <div className="flex flex-col items-start gap-1 sm:items-end">
                <Button type="button" size="sm" variant="outline" disabled>
                    {label}
                </Button>
                <p className="text-xs text-muted-foreground">
                    {missingAccess(fix.permission)}
                </p>
            </div>
        );
    }

    return (
        <Button
            type="button"
            size="sm"
            variant={fix.kind === "merchant" ? "ghost" : "outline"}
            onClick={onOpen}
            aria-haspopup="dialog"
        >
            {fix.kind === "plan"
                ? GIVE_MODULE
                : fix.kind === "release"
                  ? "Turn on for this business…"
                  : fix.kind === "switch-on"
                    ? "Switch on for them…"
                    : "Only they can do this…"}
        </Button>
    );
}
