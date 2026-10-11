import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";

import { VERIFY_JOIN_PANEL, VERIFY_PANEL } from "@/components/auth/panel-copy";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { isJoining } from "@/lib/joining";
import { safeDestination } from "@/lib/return-to";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
    title: "Check your email · Saroh",
    description: "Enter the code we emailed you to finish setting up Saroh.",
};

export default async function VerifyEmailPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    // The destination is checked HERE, on the server, for the same reason the
    // sign-in page checks it (#222): the trusted-origin list comes from an env
    // var the browser never sees. Someone who was bounced here to verify
    // first should still land where they were going.
    const { redirect } = await searchParams;
    const returnTo = safeDestination(redirect);

    // `useSearchParams` (the form reads ?email=) opts the tree into client-side
    // rendering, so it needs a Suspense boundary to prerender.
    return (
        <SplitShell
            panel={
                <SplitPanel
                    {...(isJoining(returnTo)
                        ? VERIFY_JOIN_PANEL
                        : VERIFY_PANEL)}
                />
            }
        >
            <Suspense>
                <VerifyEmailForm returnTo={returnTo} />
            </Suspense>
        </SplitShell>
    );
}
