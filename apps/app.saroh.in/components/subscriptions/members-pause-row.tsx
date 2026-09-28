"use client";

import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { setMembersCanPause } from "@/lib/subscriptions/actions";

/**
 * "Members can pause from their account" (round-2 A8), on the Plans tab:
 * whether people on a plan can pause it themselves, for 2, 4 or 8 weeks,
 * from their account on the business's website. On by default. Shown only
 * once customers have an account area (`accountArea`), and changeable only
 * by someone who may change subscriptions.
 */
export function MembersPauseRow({
    on: initial,
    canWrite,
}: {
    on: boolean;
    canWrite: boolean;
}) {
    const router = useRouter();
    const id = useId();
    const [on, setOn] = useState(initial);
    const [pending, start] = useTransition();

    function change(next: boolean) {
        setOn(next);
        start(async () => {
            const res = await setMembersCanPause(next);
            if (!res.ok) {
                setOn(!next);
                showError(res.error);
                return;
            }
            showSuccess(
                next
                    ? "Members can pause from their account."
                    : "Members can no longer pause from their account.",
            );
            router.refresh();
        });
    }

    return (
        <div className="mb-3 flex items-start gap-3 rounded-[12px] border border-border bg-card px-4 py-3">
            <div className="min-w-0 flex-1">
                <label
                    htmlFor={id}
                    className="block text-[14px] font-semibold text-foreground"
                >
                    Members can pause from their account
                </label>
                <p
                    id={`${id}-hint`}
                    className="mt-0.5 text-pretty text-[12.5px] text-muted-foreground"
                >
                    People on a plan can pause it for 2, 4 or 8 weeks from their
                    account on your website. Nothing is charged while it&apos;s
                    paused. You can pause anyone from their subscription either
                    way.
                </p>
            </div>
            <Switch
                id={id}
                checked={on}
                disabled={!canWrite || pending}
                onCheckedChange={change}
                aria-describedby={`${id}-hint`}
                className="mt-0.5 cursor-pointer disabled:cursor-default"
            />
        </div>
    );
}
