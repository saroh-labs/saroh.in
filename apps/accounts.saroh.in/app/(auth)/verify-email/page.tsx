import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { safeDestination } from "@/lib/return-to";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
    title: "Verify your email | Saroh",
    description: "Enter the code we emailed you to finish setting up Saroh.",
};

export default async function VerifyEmailPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    // The destination is checked HERE, on the server, for the same reason the
    // login page checks it (#222): the trusted-origin list comes from an env
    // var the browser never sees. Someone who was bounced here to verify
    // first should still land where they were going.
    const { redirect } = await searchParams;

    // `useSearchParams` (the form reads ?email=) opts the tree into client-side
    // rendering, so it needs a Suspense boundary to prerender.
    return (
        <Suspense>
            <VerifyEmailForm returnTo={safeDestination(redirect)} />
        </Suspense>
    );
}
