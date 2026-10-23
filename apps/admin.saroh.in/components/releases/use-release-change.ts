"use client";

import { createContext, useCallback, useContext } from "react";

import type { AdminFlag } from "@/lib/control-plane";
import {
    clearFlagOverrideAction,
    setFlagOverrideAction,
    setGlobalFlagAction,
} from "@/lib/flag-actions";
import type { ReleaseChange } from "@/lib/releases";
import { businesses, inverseOf, undoReason } from "@/lib/releases";
import type { ChangeFeedback } from "@/lib/use-change-feedback";
import { useChangeFeedback } from "@/lib/use-change-feedback";

/**
 * A list's own `report`, so a change made from one of its rows lights that
 * row and keeps it in place under the list's filter (R9). Without one, a
 * change reports through a feedback of its own (the release page).
 */
export const ReleaseFeedbackContext = createContext<
    ((feedback: ChangeFeedback) => void) | null
>(null);

export { UNDO_MS } from "@/lib/use-change-feedback";

export type ChangeResult = { ok: true } | { ok: false; error: string };

/** Send one change through the matching server action. */
export async function applyChange(
    flagKey: string,
    change: ReleaseChange,
    reason: string,
    idempotencyKey: string,
): Promise<ChangeResult> {
    const result =
        change.kind === "global"
            ? await setGlobalFlagAction(
                  flagKey,
                  change.enabled,
                  reason,
                  idempotencyKey,
              )
            : change.kind === "set"
              ? await setFlagOverrideAction(
                    flagKey,
                    change.organizationId,
                    change.enabled,
                    reason,
                    idempotencyKey,
                )
              : await clearFlagOverrideAction(
                    flagKey,
                    change.organizationId,
                    reason,
                    idempotencyKey,
                );
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** "Payments is on for Rye & Co.", "… for everyone", "… for 3 businesses". */
export function describeChange(
    flag: AdminFlag,
    change: ReleaseChange,
    who: string,
): string {
    const name = flag.metadata.shownAs;
    if (change.kind === "global") {
        return `${name} is ${change.enabled ? "on" : "off"} for everyone`;
    }
    if (change.kind === "clear") {
        return `${who} uses the default for ${name}`;
    }
    return `${name} is ${change.enabled ? "on" : "off"} for ${who}`;
}

/**
 * After a change worked: say what changed and offer Undo (R6). Undo is its
 * own recorded change, with its own key and the reason "Undo: <reason>",
 * putting back what each business had before (`inverseOf`).
 */
export function useReleaseFeedback(flag: AdminFlag) {
    const own = useChangeFeedback().report;
    const report = useContext(ReleaseFeedbackContext) ?? own;
    return useCallback(
        (
            changes: { change: ReleaseChange; name: string }[],
            reason: string,
        ) => {
            const first = changes.at(0);
            if (!first) return;
            const who =
                changes.length === 1 ? first.name : businesses(changes.length);
            // The flag as it was, so Undo restores that and not the refresh.
            const before = flag;
            report({
                rowId: flag.key,
                message: describeChange(flag, first.change, who),
                undo: async () => {
                    const failed: string[] = [];
                    for (const { change, name } of changes) {
                        const result = await applyChange(
                            before.key,
                            inverseOf(change, before),
                            undoReason(reason),
                            crypto.randomUUID(),
                        );
                        if (!result.ok) failed.push(name);
                    }
                    return failed.length > 0
                        ? {
                              ok: false,
                              description: `Still changed for ${failed.join(", ")}. Change ${failed.length === 1 ? "it" : "them"} back from Who has it.`,
                          }
                        : { ok: true };
                },
            });
        },
        [flag, report],
    );
}
