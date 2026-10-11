"use client";

import { SetupChecklist } from "@/components/shared/setup-checklist";
import type { ShareStep, ShareStepKey } from "@/lib/sites/settings-page";

/** The verb on an unmet step. */
const VERB: Record<ShareStepKey, string> = {
    title: "Write",
    description: "Write",
    image: "Add",
    menu: "Build",
};

/**
 * "Before you share your site · 2 of 4 done" (Website › Settings audit, the
 * goal gradient told honestly), drawn by the one checklist
 * (`components/shared/setup-checklist.tsx`): the steps that are true to ask
 * for, from what is already done. Each one not done has one button, which
 * opens its row in place where the reader may change it: `onJump` switches
 * to its tab first.
 *
 * With every step done it says so and folds to one quiet line: nothing is
 * asked of the owner, and the card would only push the settings down. What
 * it says follows whether the site is live, since a site that isn't
 * published can't be shared yet.
 */
export function ShareChecklist({
    steps,
    live,
    onJump,
    canEdit = false,
    siteId,
}: {
    steps: readonly ShareStep[];
    live: boolean;
    /** Opens the row for editing; absent for someone who can't change it. */
    onJump?: (step: ShareStep) => void;
    /** Whether the reader may change the rows: "Write" or just "Show". */
    canEdit?: boolean;
    /** What the finished state is remembered by, in this browser. */
    siteId?: string;
}) {
    return (
        <SetupChecklist
            name="share"
            title="Before you share your site"
            doneTitle={
                live
                    ? "Your site is ready to share."
                    : "Ready to share once you publish."
            }
            rows={steps.map((step) => ({
                key: step.key,
                label: step.label,
                done: step.done,
                note: step.done ? (step.note ?? undefined) : undefined,
                action: {
                    label: canEdit ? VERB[step.key] : "Show",
                    // The row's own address, and a press that opens it in
                    // place once the page's script is there.
                    href: `#${step.anchor}`,
                    ...(onJump ? { onPress: () => onJump(step) } : {}),
                },
            }))}
            foldKey={siteId ? `share:${siteId}` : undefined}
        />
    );
}
