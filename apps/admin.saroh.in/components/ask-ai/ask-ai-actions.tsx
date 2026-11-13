"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import {
    decideAiRequestAction,
    resolveAiReportAction,
    setAiHaltAction,
    setAiSettingAction,
} from "@/lib/ask-ai-actions";
import { settingValueWords } from "@/lib/ask-ai-words";

import { OperatorDialog } from "../operator-dialog";

/**
 * Ask AI's console writes (DEC-220, U8), each an `OperatorDialog` with a
 * reason. Shown only to staff who may make them; the API refuses anyway.
 */

/** Set one AI setting: a new row with a reason, checked by the API. */
export function SetAiSetting({
    settingKey,
    current,
}: {
    settingKey: string;
    current: unknown;
}) {
    return (
        <OperatorDialog
            trigger="Set"
            triggerVariant="ghost"
            title={`Set ${settingKey}`}
            effect="A new value from now on. The old one stays in the history; the API refuses a value outside the setting's bounds."
            fields={
                <div className="grid gap-1.5">
                    <Label htmlFor={`value-${settingKey}`}>Value</Label>
                    <Input
                        id={`value-${settingKey}`}
                        name="value"
                        defaultValue={
                            current === undefined
                                ? ""
                                : settingValueWords(current)
                        }
                        className="font-mono"
                        autoComplete="off"
                    />
                </div>
            }
            submitLabel="Set"
            onSubmit={({ reason, idempotencyKey, values }) =>
                setAiSettingAction({
                    key: settingKey,
                    value: values.value ?? "",
                    reason,
                    idempotencyKey,
                })
            }
        />
    );
}

/** Halt every agent, or lift the halt. */
export function AiHaltSwitch({ halted }: { halted: boolean }) {
    return (
        <OperatorDialog
            trigger={halted ? "Lift the halt" : "Halt Ask AI"}
            triggerVariant={halted ? "outline" : "destructive"}
            destructive={!halted}
            title={halted ? "Lift the halt" : "Halt Ask AI for everyone"}
            effect={
                halted
                    ? "Ask AI works again for every business it is rolled out to."
                    : "Nobody can ask until the halt is lifted, whatever a business's own setting. Questions already running finish."
            }
            submitLabel={halted ? "Lift the halt" : "Halt"}
            onSubmit={({ reason, idempotencyKey }) =>
                setAiHaltAction({ halted: !halted, reason, idempotencyKey })
            }
        />
    );
}

/** Grant one pack of the plan's Ask AI add-on for this period, or decline. */
export function DecideAiRequest({
    id,
    business,
}: {
    id: string;
    business: string;
}) {
    return (
        <span className="flex flex-wrap gap-2">
            <OperatorDialog
                trigger="Grant"
                triggerVariant="outline"
                title={`Grant more questions to ${business}`}
                effect="Adds one pack of the plan's Ask AI questions for this billing period only. It is billed after the period, and comes off on its own just before the period ends."
                submitLabel="Grant"
                onSubmit={({ reason, idempotencyKey }) =>
                    decideAiRequestAction({
                        id,
                        decision: "grant",
                        reason,
                        idempotencyKey,
                    })
                }
            />
            <OperatorDialog
                trigger="Decline"
                triggerVariant="ghost"
                title={`Decline ${business}'s request`}
                effect="Nothing is added. The business keeps the questions its plan gives."
                submitLabel="Decline"
                onSubmit={({ reason, idempotencyKey }) =>
                    decideAiRequestAction({
                        id,
                        decision: "decline",
                        reason,
                        idempotencyKey,
                    })
                }
            />
        </span>
    );
}

export function ResolveAiReport({ id }: { id: string }) {
    return (
        <OperatorDialog
            trigger="Mark resolved"
            triggerVariant="outline"
            title="Mark the report resolved"
            effect="The report moves to Resolved. It is still deleted 90 days after it was made."
            submitLabel="Mark resolved"
            onSubmit={({ reason, idempotencyKey }) =>
                resolveAiReportAction({ id, reason, idempotencyKey })
            }
        />
    );
}
