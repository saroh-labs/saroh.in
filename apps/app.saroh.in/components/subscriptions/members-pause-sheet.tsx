"use client";

import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import { showError } from "@saroh/ui/toast";
import { useId, useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { setMembersCanPause } from "@/lib/subscriptions/actions";
import { PAUSE_LABEL } from "@/lib/subscriptions/plan-settings";

/**
 * "Members can pause from their account" (round-2 A8), changed in its
 * row's sheet: whether people on a plan can pause it themselves, for 2, 4
 * or 8 weeks, from their account on the business's website. On by default.
 *
 * It is a switch, so it takes effect as it is flipped, as every switch
 * does: the sheet has nothing left to save and its foot is one Done. The
 * row says the toast and offers Undo (`plan-settings.tsx`). A refusal puts
 * the switch back and says why.
 */
export function MembersPauseSheet({
    on,
    open,
    returnTo,
    onClose,
    onChanged,
}: {
    /** The setting as it is saved now. */
    on: boolean;
    open: boolean;
    /** The id of the Edit that takes the keyboard back. */
    returnTo: string;
    onClose: () => void;
    /** It was saved as this. */
    onChanged: (on: boolean) => void;
}) {
    const id = useId();
    const [pending, setPending] = useState(false);
    // What was asked for, while the save is on its way.
    const [asked, setAsked] = useState<boolean | null>(null);

    async function change(next: boolean) {
        setAsked(next);
        const res = await runAction(() => setMembersCanPause(next), {
            setBusy: setPending,
        });
        setAsked(null);
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        onChanged(next);
    }

    return (
        <FormSheet
            open={open}
            returnFocusTo={returnTo}
            title={PAUSE_LABEL}
            description="For every plan. It changes as soon as you flip the switch."
            pending={pending}
            dirty={false}
            onClose={onClose}
            doneOnly
        >
            <div className="flex items-start gap-3 rounded-[10px] border border-border bg-card px-3 py-2.5">
                <div className="min-w-0 flex-1">
                    <Label
                        htmlFor={id}
                        className="block cursor-pointer text-[13.5px] font-semibold text-foreground"
                    >
                        {PAUSE_LABEL}
                    </Label>
                    <p
                        id={`${id}-hint`}
                        className="mt-0.5 text-pretty text-[12.5px] leading-normal text-muted-foreground"
                    >
                        People on a plan can pause it for 2, 4 or 8 weeks from
                        their account on your website. Nothing is charged while
                        it&apos;s paused. You can pause anyone from their
                        subscription either way.
                    </p>
                </div>
                <Switch
                    id={id}
                    checked={asked ?? on}
                    disabled={pending}
                    onCheckedChange={(next) => void change(next)}
                    aria-describedby={`${id}-hint`}
                    className="mt-0.5 cursor-pointer disabled:cursor-default"
                />
            </div>
        </FormSheet>
    );
}
