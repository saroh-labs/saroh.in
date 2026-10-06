import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";

import { SIGNUP_PANEL } from "@/components/auth/panel-copy";
import { SignupForm } from "@/components/auth/signup-form";
import { onboardingForInvite, onboardingForPlan } from "@/lib/plan-intent";
import { safeDestination } from "@/lib/return-to";

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
    return (
        <SplitShell panel={<SplitPanel {...SIGNUP_PANEL} />}>
            <SignupForm
                returnTo={returnTo}
                invitedEmail={typeof email === "string" ? email : undefined}
            />
        </SplitShell>
    );
}
