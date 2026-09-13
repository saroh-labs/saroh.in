import { SignupForm } from "@/components/auth/signup-form";
import { safeDestination } from "@/lib/return-to";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sign up | Saroh",
    description: "Create an account with Saroh.",
};

/**
 * A server component, for the same reason the login page is one (#222): the
 * trusted-origin list comes from an env var the browser never sees, so the
 * destination is vetted here.
 *
 * Sign-up used to drop `?redirect=` on the floor. Someone invited to a
 * workspace who had never used Saroh (#276) is exactly the person who arrives
 * here rather than at login, and they were losing the invitation they clicked
 * and landing in onboarding for a workspace of their own.
 */
export default async function SignupPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { redirect } = await searchParams;
    return <SignupForm returnTo={safeDestination(redirect)} />;
}
