import { getServerSession } from "@saroh/auth/next";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { BusinessSetupForm } from "@/components/organizations/business-setup-form";
import { ACTIVE_ORG_COOKIE } from "@/lib/api/http";
import {
    ACTIVE_ORG_NAME_COOKIE,
    ACTIVE_ORG_USER_COOKIE,
    leftBusinessNotice,
} from "@/lib/organizations/left-business";
import {
    getOrganization,
    listOrganizations,
} from "@/lib/organizations/service";
import {
    SETUP_CURRENT_STEP,
    SETUP_STEP_LINE,
    SETUP_STEPS,
} from "@/lib/organizations/setup-plan";
import { readInviteIntent } from "@/lib/saroh-billing/invite-intent";
import { inviteNote, inviteToTake } from "@/lib/saroh-billing/launch-offer";
import {
    checkoutIntent,
    planIntentNote,
} from "@/lib/saroh-billing/plan-checkout";
import { readPlanIntent } from "@/lib/saroh-billing/plan-intent";
import { requireSession } from "@/lib/session";
import { Notice } from "@saroh/ui/notice";

export const metadata: Metadata = { title: "Set up Saroh" };

/**
 * Setup: the one screen between a new account and the product, in the same
 * split the account pages wear (see Saroh Auth Flow, the live design).
 *
 * It doubles as "Set up another" from the switcher, so Back appears only
 * when there is a workspace to go back to. A first one has nowhere behind it
 * — the account was just made — and the way out is signing out, which
 * the form offers under its button.
 *
 * One screen (UX audit, 10 Oct): the name, the web address, the country and
 * what to do first, and Create opens that first thing itself. It used to
 * call itself the "last step" and send the choice of what to do on to Home
 * and a second sheet. It says where it is in the plan the sign-up page
 * started instead: steps 2 and 3 of 3. What is being set up (DEC-070) is a
 * small choice at the top, with "A business" chosen, and the form speaks in
 * its words.
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
 */
export default async function OnboardingPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [session, organizations, query] = await Promise.all([
        getServerSession(await headers()),
        listOrganizations(),
        searchParams,
    ]);
    const hasOrgs = organizations.length > 0;
    const invite = await readInviteIntent(query);
    if (hasOrgs && query.plan !== undefined && invite.kind === "none") {
        redirect("/");
    }
    const intent =
        hasOrgs || invite.kind !== "none"
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
        <SplitShell
            panel={
                hasOrgs ? (
                    <SplitPanel
                        eyebrow="Set up another"
                        heading="One more, beside the ones you have."
                        body="Name it and pick what to do first. Create opens that thing, ready to fill in."
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
                    // The plan the sign-up page started, with the account
                    // ticked. Steps 2 and 3 are this one screen, and the
                    // page says so above its heading too, since this panel
                    // is gone on a phone.
                    <SplitPanel
                        eyebrow="Set up"
                        heading="Name it, pick a start, and you are in it."
                        body="Steps 2 and 3 are this one screen. Create opens what you picked, ready to fill in, and you can change any of this later in Settings."
                        steps={[...SETUP_STEPS]}
                        currentStep={SETUP_CURRENT_STEP}
                    />
                )
            }
        >
            {hasOrgs ? null : (
                <p className="label mb-2 text-muted-foreground">
                    {SETUP_STEP_LINE}
                </p>
            )}
            <h1 className="font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                {hasOrgs ? "Set up another" : "Set up Saroh"}
            </h1>
            <p className="mb-[22px] mt-[7px] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                {hasOrgs
                    ? "It sits beside the ones you have, and you switch between them from the top of the screen."
                    : "Name it and pick what to do first. Create opens that, ready to fill in. You can change all of this later."}
            </p>
            {left ? (
                <Notice role="status" className="-mt-2.5 mb-[22px]">
                    {left}
                </Notice>
            ) : null}
            {note ? (
                <p
                    data-testid="plan-intent"
                    className="-mt-2.5 mb-[22px] text-pretty text-[13px] leading-[1.55] text-foreground"
                >
                    {note}
                </p>
            ) : null}
            <BusinessSetupForm
                email={session?.user.email ?? ""}
                // An account made with an emailed code has no name yet.
                needsName={!!session && !session.user.name?.trim()}
                backTo={hasOrgs ? "/" : undefined}
                checkout={checkoutIntent(intent)}
                invite={inviteToTake(invite)}
                defaultName={
                    invite.kind === "ready"
                        ? (invite.businessName ?? undefined)
                        : undefined
                }
            />
        </SplitShell>
    );
}
