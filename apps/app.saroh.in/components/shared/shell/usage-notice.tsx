"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { showError } from "@saroh/ui/toast";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { runAction } from "@/lib/api/run-action";
import { dismissUsageNotice } from "@/lib/usage-sharing/actions";
import { markUsageNoticeOnScreen } from "@/lib/usage-sharing/notice-on-screen";
import { USAGE_NOTICE } from "@/lib/usage-sharing/sharing";

/**
 * The one-time notice that the workspace is recorded (DEC-125, owner 10
 * Oct), above the page like the plan banners. Shown the first time a person
 * opens the workspace where recording is on, and on every page until they
 * dismiss it; the dismissal is kept on their account, so it never comes
 * back on another device or in another business.
 *
 * The recorder waits for this: once it has drawn it says so
 * (`markUsageNoticeOnScreen`), and only then may `WorkspaceTracking` start.
 * Its words are Saroh's own, so a recording can read them.
 */
export function UsageNotice() {
    const [gone, setGone] = useState(false);
    const [pending, startTransition] = useTransition();

    // After it has drawn, never before: an effect runs once it is on screen.
    useEffect(() => {
        markUsageNoticeOnScreen();
    }, []);

    if (gone) return null;

    const dismiss = () => {
        if (pending) return;
        setGone(true);
        startTransition(async () => {
            // A save that never got there is the same to the person as
            // one that was refused: one sentence for both.
            const result = await runAction(() => dismissUsageNotice(), {
                quiet: true,
            });
            if (result?.ok) return;
            // Not kept, so it would come back on the next page: say so now.
            setGone(false);
            showError("Couldn't save that", "Try again in a moment.");
        });
    };

    return (
        // The shared banner, as the plan banners under it are.
        <Notice
            layout="banner"
            role="status"
            // One line of words and a button: level with each other.
            align="center"
            data-ph-unmask=""
            data-testid="usage-notice"
            action={
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={dismiss}
                >
                    {USAGE_NOTICE.dismiss}
                </Button>
            }
        >
            <p className="text-pretty text-[13px] leading-normal">
                {USAGE_NOTICE.body} {USAGE_NOTICE.turnOff}{" "}
                <Link
                    href={USAGE_NOTICE.href}
                    className="cursor-pointer rounded-sm font-semibold underline underline-offset-2 hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-foreground/70"
                >
                    {USAGE_NOTICE.settings}
                </Link>
                .
            </p>
        </Notice>
    );
}
