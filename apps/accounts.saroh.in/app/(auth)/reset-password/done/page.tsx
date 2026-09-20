import { Button } from "@saroh/ui/button";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import Link from "next/link";

import { DONE_PANEL } from "@/components/auth/panel-copy";

export const metadata: Metadata = {
    title: "Password changed | Saroh",
    description: "Your password has been changed.",
};

/**
 * What just happened, in the past tense.
 *
 * A route rather than a two-second toast before a redirect: ending every other
 * session is a consequential thing to have done, and the person it happened to
 * should be able to sit on this page, read it, and follow the link when they
 * are ready — not watch it disappear on a timer.
 */
export default function PasswordResetDonePage() {
    return (
        <SplitShell panel={<SplitPanel {...DONE_PANEL} />}>
            <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                Password changed
            </h1>
            <p className="sa-rise dark:text-muted-foreground mb-[22px] mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600">
                Every other session has ended — anything signed in as you
                elsewhere has been signed out. Log in with the new password.
            </p>
            <Button
                asChild
                className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
            >
                <Link href="/login">Log in</Link>
            </Button>
        </SplitShell>
    );
}
