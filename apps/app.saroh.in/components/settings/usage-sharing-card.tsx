"use client";

import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useOptimistic, useTransition } from "react";

import { runAction } from "@/lib/api/run-action";
import { browserTracking } from "@/lib/error-tracking-browser";
import { saveUsageSharing } from "@/lib/usage-sharing/actions";
import {
    USAGE_SHARING_HELP,
    USAGE_SHARING_LABEL,
} from "@/lib/usage-sharing/sharing";

/**
 * "Help improve Saroh" (DEC-125), Settings › Your profile: whether this
 * person shares how they use the workspace as recordings in which their
 * customers' details and anything typed are hidden. Shown only
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
            const result = await runAction(() => saveUsageSharing(next));
            // It never got there, and has been said: the switch goes back.
            if (!result) return;
            if (!result.ok) {
                showError(result.error, "Your choice is as it was.");
                return;
            }
            showSuccess(
                next
                    ? "You're sharing how you use Saroh"
                    : "You've stopped sharing how you use Saroh",
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
                {/* The shared switch, as the alerts above it are. A press
                    while a save is out is dropped in `flip`, not disabled:
                    the switch keeps the keyboard. */}
                <Switch
                    checked={shown}
                    aria-busy={pending || undefined}
                    aria-labelledby="usage-sharing-title"
                    aria-describedby="usage-sharing-help"
                    onCheckedChange={flip}
                    className="wk-press"
                />
            </div>
            <p className="text-pretty border-t border-border/70 bg-muted/50 px-[18px] py-3 text-[12.5px] text-foreground/80">
                Saroh records how it is used, to find what is confusing or
                broken. A recording shows Saroh&rsquo;s own buttons, menus and
                labels. Your customers&rsquo; details, your figures and anything
                you type are hidden, and pictures are left out. Only for you, on
                every device. Your team chooses for themselves.
            </p>
        </section>
    );
}
