"use client";

import { Button } from "@saroh/ui/button";
import { CopyButton } from "@saroh/ui/copy-button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Notice } from "@saroh/ui/notice";
import { Check, CircleDashed, X } from "lucide-react";

import { OperatorDialog } from "@/components/operator-dialog";
import type { BusinessModuleState } from "@/lib/businesses";
import type { GateLine } from "@/lib/module-fix";
import { gatesFor, stepsToSend } from "@/lib/module-fix";
import { QUICK_REASONS } from "@/lib/releases";

/** What a fix did, for the row to flip and say. */
export interface FixDone {
    /** The fix that was made, and its reason (Undo is recorded with it). */
    kind: "release" | "switch-on";
    reason: string;
    /** The module's state as the API read it back; null when unread. */
    row: BusinessModuleState | null;
}

/**
 * The fix sheet (admin plan U4, R3): one module, the gates it passes and
 * fails, and the one action that clears the gate in its way, asking for a
 * reason like every console write. Opened from a row's fix button and
 * mounted only while open, so each opening is a fresh attempt with its own
 * idempotency key; the rows keep one open at a time.
 *
 * - Release off: "Turn on for this business", an override of the
 *   release for this business alone (`flags:publish`).
 * - Their switch off: "Switch on for them", their own module switch
 *   (`organization:modules:write`).
 * - Only they can do it (setup, or a step in their app): the step in words
 *   and Copy steps to send them. Nothing to write, so no reason.
 */
export function FixSheet({
    row,
    businessName,
    onOpenChange,
    onFix,
}: {
    row: BusinessModuleState;
    businessName: string;
    onOpenChange: (open: boolean) => void;
    /**
     * Makes the fix. Resolves `{ ok: false, error }` to keep the sheet open
     * with the API's reason.
     */
    onFix: (input: {
        reason: string;
        idempotencyKey: string;
    }) => Promise<{ ok: boolean; error?: string }>;
}) {
    const fix = row.fix;
    const gates = <GateList gates={gatesFor(row)} />;

    if (fix?.kind === "release" || fix?.kind === "switch-on") {
        const release = fix.kind === "release";
        return (
            <OperatorDialog
                open
                onOpenChange={onOpenChange}
                title={
                    release
                        ? `Turn ${row.label} on for ${businessName}?`
                        : `Switch ${row.label} on for ${businessName}?`
                }
                effect={
                    <div className="grid gap-3">
                        {gates}
                        <p>
                            {release
                                ? `${row.label}'s release is turned on for ${businessName} alone, whatever the default for everyone is. Releases › Who has it lists them.`
                                : `${row.label} is switched on in ${businessName}'s workspace, as if they had done it in their Settings. Anything it works with must already be on.`}
                        </p>
                    </div>
                }
                submitLabel={
                    release ? "Turn on for this business" : "Switch on for them"
                }
                quickReasons={release ? QUICK_REASONS : undefined}
                onSubmit={({ reason, idempotencyKey }) =>
                    onFix({ reason, idempotencyKey })
                }
            />
        );
    }

    // Only they can do it: the step, and the words to send them.
    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {row.label}: only they can do this
                    </DialogTitle>
                    <DialogDescription asChild>
                        <div className="grid gap-3 text-sm text-muted-foreground">
                            {gates}
                            <Notice tone="info" role="none">
                                {row.reason ?? "A step in their own app."} Saroh
                                can&rsquo;t do it for them. Send them the steps.
                            </Notice>
                        </div>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                    >
                        Close
                    </Button>
                    <CopyButton
                        value={stepsToSend(row, businessName)}
                        label="Copy steps"
                        thing="steps"
                        variant="default"
                    />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const GATE_ICON = {
    pass: Check,
    fail: X,
    later: CircleDashed,
} as const;

const GATE_WORD = {
    pass: "Passes",
    fail: "In the way",
    later: "Not checked yet",
} as const;

/** The gates in the order the workspace checks them, each with its state. */
function GateList({ gates }: { gates: GateLine[] }) {
    return (
        <ol className="grid gap-1.5" aria-label="Gates">
            {gates.map((gate) => {
                const Icon = GATE_ICON[gate.status];
                return (
                    <li
                        key={gate.gate}
                        data-gate={gate.gate}
                        data-status={gate.status}
                        className="flex items-start gap-2 text-sm"
                    >
                        <Icon
                            aria-hidden
                            className={
                                gate.status === "fail"
                                    ? "mt-0.5 size-4 shrink-0 text-destructive"
                                    : gate.status === "pass"
                                      ? "mt-0.5 size-4 shrink-0 text-success"
                                      : "mt-0.5 size-4 shrink-0 text-muted-foreground"
                            }
                        />
                        <span className="min-w-0">
                            <span className="font-medium text-foreground">
                                {gate.label}
                            </span>
                            <span className="sr-only">
                                {" "}
                                {GATE_WORD[gate.status]}
                            </span>
                            {" · "}
                            {gate.words}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
