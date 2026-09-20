import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import Link from "next/link";

import { SENT_PANEL } from "@/components/auth/panel-copy";

export const metadata: Metadata = {
    title: "Check your email | Saroh",
    description: "A reset link is on its way.",
};

/**
 * The confirmation, as a page rather than a state.
 *
 * It is reached whenever the REQUEST succeeded, which it does for an address
 * with no account too — so every word here has to read the same either way.
 * "If an account exists" is doing real work: it is the difference between a
 * page that reassures and a page that can be used to find out who is
 * registered with Saroh.
 *
 * The address comes back through the query string so a reload still knows
 * where the link went. It is the visitor's own address, typed a moment ago.
 */
export default async function ResetLinkSentPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { email } = await searchParams;
    const address = Array.isArray(email) ? email[0] : email;

    return (
        <SplitShell panel={<SplitPanel {...SENT_PANEL} />}>
            <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                Check your email
            </h1>
            <p className="sa-rise dark:text-muted-foreground mb-[22px] mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600">
                If an account exists for{" "}
                <span className="text-foreground">
                    {address ?? "that address"}
                </span>
                , a reset link is on its way.
            </p>
            <p className="sa-rise text-muted-foreground text-pretty text-[12.5px] leading-[1.5]">
                Nothing arrived? Check spam, or{" "}
                <Link
                    href="/forgot-password"
                    className="text-foreground underline-offset-4 transition-colors hover:underline"
                >
                    ask again
                </Link>
                . Asking again replaces the previous link.
            </p>
            <p className="sa-rise text-muted-foreground mt-5 text-[12.5px]">
                <Link
                    href="/login"
                    className="text-foreground underline-offset-4 transition-colors hover:underline"
                >
                    Back to log in
                </Link>
            </p>
        </SplitShell>
    );
}
