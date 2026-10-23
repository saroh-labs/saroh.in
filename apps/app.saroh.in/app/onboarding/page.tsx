import { getServerSession } from "@saroh/auth/next";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { BusinessSetupForm } from "@/components/organizations/setup/business-setup-form";
import { SetupPanel } from "@/components/organizations/setup/setup-panel";
import { SetupStepProvider } from "@/components/organizations/setup/setup-step-context";
import { ACTIVE_ORG_COOKIE } from "@/lib/api/http";
import {
    listMyBillingProfiles,
    profileOptions,
} from "@/lib/billing-profiles/service";
import {
    ACTIVE_ORG_NAME_COOKIE,
    ACTIVE_ORG_USER_COOKIE,
    leftBusinessNotice,
} from "@/lib/organizations/left-business";
import {
    getOrganization,
    listOrganizations,
} from "@/lib/organizations/service";
import { stepFromQuery } from "@/lib/organizations/setup-steps";
import { readInviteIntent } from "@/lib/saroh-billing/invite-intent";
import { inviteNote, inviteToTake } from "@/lib/saroh-billing/launch-offer";
import {
    checkoutIntent,
    planIntentNote,
} from "@/lib/saroh-billing/plan-checkout";
import { readPlanIntent } from "@/lib/saroh-billing/plan-intent";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { requireSession } from "@/lib/session";
import { Notice } from "@saroh/ui/notice";

export const metadata: Metadata = { title: "Set up Saroh" };

/**
 * Setup: the steps between a new account and the product, in the same split
 * the account pages wear (see Saroh Auth Flow, the live design).
 *
 * A stepper (DEC-130, amended 11 Oct 2026): one question to a screen, with
 * Back and Continue. What is being set up (DEC-070), its name and web
 * address, and what to do first, whose button creates the business and
 * opens that first thing itself. Which step is on show is in the address
 * (`?step=`), read here for the first paint and kept by the browser after
 * that (`setup-step-context.tsx`). The form draws the step's own heading,
 * and the panel beside it marks the same step in the plan the sign-up page
 * started.
 *
 * It doubles as "Set up another" from the switcher, so the first step has a
 * Back only when there is a workspace to go back to. A first one has
 * nowhere behind it (the account was just made) and the way out is signing
 * out, which the form offers under its buttons on every step.
 *
 * A plan picked on saroh.in arrives from sign-up as `?plan=&cycle=` (plan
 * U27). It is checked against the live catalogue and said in one line under
 * the heading; once the business exists, a paid plan goes on to its checkout
 * and anything else stays on Free, where every business starts. It is for a
 * first business only: someone who already has one and follows a plan link
 * here goes to their workspace rather than making another.
 *
 * An opening-day invite arrives as `?invite=` (plan U31). It wins over a
 * plan: the business takes the launch offer instead of a checkout, and the
 * name it was listed under on the waitlist fills the form. Unlike a plan it
 * works for another business too — one owner may have listed two (OQ-11).
 *
 * While plans aren't shown (DEC-136) neither is read: no plan is named
 * under the heading, nothing goes on to a checkout, and no offer is taken.
 *
 * An owner who has a billing profile already (DEC-167, R7) is asked who
 * Saroh bills for the new business, between its name and what to do
 * first. Someone with none isn't: their first is made from the business.
 */
export default async function OnboardingPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [session, organizations, query, billingProfiles] = await Promise.all([
        getServerSession(await headers()),
        listOrganizations(),
        searchParams,
        // Who Saroh bills (DEC-167, R7): asked when they have any.
        listMyBillingProfiles(),
    ]);
    const hasOrgs = organizations.length > 0;
    const asksBilling = billingProfiles.length > 0;
    const plans = plansShown();
    const invite = plans
        ? await readInviteIntent(query)
        : ({ kind: "none" } as const);
    if (hasOrgs && query.plan !== undefined && invite.kind === "none") {
        redirect("/");
    }
    const intent =
        !plans || hasOrgs || invite.kind !== "none"
            ? ({ kind: "none" } as const)
            : await readPlanIntent(query);
    const note = inviteNote(invite) ?? planIntentNote(intent);
    // Removed from the business they were in: said, not set up as new.
    const jar = await cookies();
    const activeId = jar.get(ACTIVE_ORG_COOKIE)?.value;
    const maybeLeft = session
        ? leftBusinessNotice({
              activeId,
              activeName: jar.get(ACTIVE_ORG_NAME_COOKIE)?.value,
              activeUser: jar.get(ACTIVE_ORG_USER_COOKIE)?.value,
              userId: session.user.id,
              memberOf: organizations.map((o) => o.id),
          })
        : null;
    // Asked of that business itself before saying it: an empty list can be
    // an outage, and "you're no longer in" must only ever be a 403 or 404.
    const left =
        maybeLeft && activeId
            ? await getOrganization(activeId).then(
                  (org) => (org ? null : maybeLeft),
                  () => null,
              )
            : null;

    return (
        <SetupStepProvider initial={stepFromQuery(query.step)}>
            <SplitShell
                panel={
                    hasOrgs ? (
                        <SplitPanel
                            eyebrow="Set up another"
                            heading="One more, beside the ones you have."
                            body={
                                asksBilling
                                    ? "Say what it is, name it, choose who Saroh bills and pick what to do first. The last step opens that thing, ready to fill in."
                                    : "Say what it is, name it and pick what to do first. The last step opens that thing, ready to fill in."
                            }
                            points={[
                                // True: name and country change in Business
                                // settings, and the web address in its Web
                                // address card, where a change breaks saved
                                // links (UX-085).
                                "You can change any of it later in Settings",
                                "You are the Owner of what you create",
                                "Everything else is one tap away on Home",
                            ]}
                        />
                    ) : (
                        // The plan the sign-up page started, with the
                        // account ticked and the step on show marked.
                        <SetupPanel />
                    )
                }
            >
                <BusinessSetupForm
                    email={session?.user.email ?? ""}
                    // An account made with an emailed code has no name yet.
                    needsName={!!session && !session.user.name?.trim()}
                    another={hasOrgs}
                    billingProfiles={profileOptions(billingProfiles)}
                    backTo={hasOrgs ? "/" : undefined}
                    checkout={checkoutIntent(intent)}
                    invite={inviteToTake(invite)}
                    defaultName={
                        invite.kind === "ready"
                            ? (invite.businessName ?? undefined)
                            : undefined
                    }
                    arrival={
                        left ? <Notice role="status">{left}</Notice> : null
                    }
                    note={
                        note ? (
                            <p
                                data-testid="plan-intent"
                                className="text-pretty text-[13px] leading-[1.55] text-foreground"
                            >
                                {note}
                            </p>
                        ) : null
                    }
                />
            </SplitShell>
        </SetupStepProvider>
    );
}
