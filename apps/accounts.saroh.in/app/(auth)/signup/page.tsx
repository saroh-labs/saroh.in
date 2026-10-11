import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";

import { SIGNUP_JOIN_PANEL, SIGNUP_PANEL } from "@/components/auth/panel-copy";
import { SignupForm } from "@/components/auth/signup-form";
import { isJoining } from "@/lib/joining";
import { onboardingForInvite, onboardingForPlan } from "@/lib/plan-intent";
import { safeDestination } from "@/lib/return-to";
import { signInProviders } from "@/lib/sign-in-options";

export const metadata: Metadata = {
    title: "Sign up · Saroh",
    description: "Sell, take bookings, bill and run your website in one place.",
};

/**
 * A server component, for the same reason the sign-in page is one (#222): the
 * trusted-origin list comes from an env var the browser never sees, so the
 * destination is vetted here.
 *
 * Sign-up used to drop `?redirect=` on the floor. Someone invited to a
 * business who had never used Saroh (#276) is exactly the person who arrives
 * here rather than at sign-in, and they were losing the invitation they
 * clicked and landing in setup for a business of their own.
 *
 * A visitor who picked a plan on saroh.in arrives with `?plan=&cycle=` (plan
 * U27). With nowhere else to return to, the account goes on to onboarding
 * carrying them, and from there to that plan's checkout. An invitation's
 * `redirect` wins: an invitee joins someone else's business, and buys
 * nothing.
 *
 * Someone invited off the waitlist arrives with `?invite=&email=` (plan
 * U31): the address fills the form, and the invite rides to onboarding,
 * where it gives the business the launch offer. It wins over a plan.
 */
export default async function SignupPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { redirect, email, plan, cycle, invite } = await searchParams;
    const returnTo =
        safeDestination(redirect) ??
        onboardingForInvite(invite) ??
        onboardingForPlan(plan, cycle);
    const providers = await signInProviders();
    return (
        <SplitShell
            // An invitee joins a business that exists: no three-step plan.
            panel={
                <SplitPanel
                    {...(isJoining(returnTo)
                        ? SIGNUP_JOIN_PANEL
                        : SIGNUP_PANEL)}
                />
            }
        >
            <SignupForm
                returnTo={returnTo}
                invitedEmail={typeof email === "string" ? email : undefined}
                providers={providers}
            />
        </SplitShell>
    );
}
