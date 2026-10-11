"use client";

import { Button } from "@saroh/ui/button";
import { showError } from "@saroh/ui/toast";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

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
            const result = await dismissUsageNotice();
            if (result.ok) return;
            // Not kept, so it would come back on the next page: say so now.
            setGone(false);
            showError("Couldn't save that", "Try again in a moment.");
        });
    };

    return (
        <div
            role="status"
            data-ph-unmask=""
            data-testid="usage-notice"
            className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-border/70 bg-muted/50 px-4 py-2.5 sm:px-6"
        >
            <p className="min-w-0 flex-[1_1_320px] text-pretty text-[13px] leading-normal text-foreground">
                {USAGE_NOTICE.body} {USAGE_NOTICE.turnOff}{" "}
                <Link
                    href={USAGE_NOTICE.href}
                    className="cursor-pointer rounded-sm font-semibold underline underline-offset-2 hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-foreground/70"
                >
                    {USAGE_NOTICE.settings}
                </Link>
                .
            </p>
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={dismiss}
            >
                {USAGE_NOTICE.dismiss}
            </Button>
        </div>
    );
}
