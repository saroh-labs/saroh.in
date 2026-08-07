import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
    title: "Verify your email | Saroh",
    description: "Enter the code we emailed you to finish setting up Saroh.",
};

export default function VerifyEmailPage() {
    // `useSearchParams` (the form reads ?email=) opts the tree into client-side
    // rendering, so it needs a Suspense boundary to prerender.
    return (
        <Suspense>
            <VerifyEmailForm />
        </Suspense>
    );
}
