"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useOptimistic, useTransition } from "react";

import { browserTracking } from "@/lib/error-tracking-browser";
import { saveUsageSharing } from "@/lib/usage-sharing/actions";
import {
    USAGE_SHARING_HELP,
    USAGE_SHARING_LABEL,
} from "@/lib/usage-sharing/sharing";

/**
 * "Help improve Saroh" (DEC-125), Settings › Your profile: whether this
 * person shares how they use the workspace as masked recordings. Shown only
 * where recording is switched on at all; on unless they turn it off.
 *
 * Turning it off stops the recorder in this tab before the save is even
 * sent, and the choice is kept on their account, so it holds on every
 * device and in every business. The switch moves as it is pressed and goes
 * back if the save is refused.
 */
export function UsageSharingCard({ on }: { on: boolean }) {
    const [pending, startTransition] = useTransition();
    const [shown, setShown] = useOptimistic(on);

    const flip = () => {
        if (pending) return;
        const next = !shown;
        // Off takes effect now, whatever the save does.
        if (!next) browserTracking?.stopReplay();
        startTransition(async () => {
            setShown(next);
            const result = await saveUsageSharing(next);
            if (!result.ok) {
                showError(result.error, "Your choice is as it was.");
                return;
            }
            showSuccess(
                next
                    ? "You're sharing how you use the workspace"
                    : "You've stopped sharing how you use the workspace",
            );
        });
    };

    return (
        <section
            aria-label={USAGE_SHARING_LABEL}
            className="overflow-hidden rounded-xl border border-border bg-card"
        >
            <div className="flex items-center gap-4 px-[18px] py-3">
                <div className="min-w-0 flex-1">
                    <h3
                        id="usage-sharing-title"
                        className="font-display text-[15px] font-semibold"
                    >
                        {USAGE_SHARING_LABEL}
                    </h3>
                    <p
                        id="usage-sharing-help"
                        className="text-pretty text-[13px] text-muted-foreground"
                    >
                        {USAGE_SHARING_HELP}
                    </p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={shown}
                    aria-busy={pending || undefined}
                    aria-labelledby="usage-sharing-title"
                    aria-describedby="usage-sharing-help"
                    onClick={flip}
                    className={cn(
                        "wk-press shrink-0 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        pending
                            ? "cursor-progress"
                            : "cursor-pointer hover:bg-muted active:bg-border",
                    )}
                >
                    <span
                        className={cn(
                            "relative block h-6 w-[42px] rounded-full transition-colors duration-fast",
                            shown ? "bg-foreground" : "bg-border",
                        )}
                    >
                        <span
                            className={cn(
                                "absolute top-[3px] size-[18px] rounded-full bg-card transition-[left] duration-fast",
                                shown ? "left-[21px]" : "left-[3px]",
                            )}
                        />
                    </span>
                </button>
            </div>
            <p className="text-pretty border-t border-border/70 bg-muted/50 px-[18px] py-3 text-[12.5px] text-foreground/80">
                Saroh sometimes records how the workspace is used, to find what
                is confusing or broken. Every word, number and field is hidden
                in a recording, and pictures are left out. Only for you, on
                every device; your team chooses for themselves.
            </p>
        </section>
    );
}
