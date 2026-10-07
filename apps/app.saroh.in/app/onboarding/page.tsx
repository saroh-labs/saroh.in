import { getServerSession } from "@saroh/auth/next";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { BusinessSetupForm } from "@/components/organizations/business-setup-form";
import { ACTIVE_ORG_COOKIE } from "@/lib/api/http";
import {
    ACTIVE_ORG_NAME_COOKIE,
    leftBusinessNotice,
} from "@/lib/organizations/left-business";
import {
    getOrganization,
    listOrganizations,
} from "@/lib/organizations/service";
import { readInviteIntent } from "@/lib/saroh-billing/invite-intent";
import { inviteNote, inviteToTake } from "@/lib/saroh-billing/launch-offer";
import {
    checkoutIntent,
    planIntentNote,
} from "@/lib/saroh-billing/plan-checkout";
import { readPlanIntent } from "@/lib/saroh-billing/plan-intent";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Set up Saroh" };

/**
 * Setup: the one step between a verified account and the workspace, in the
 * same split the account pages wear (see Saroh Auth Flow, the live design).
 *
 * It doubles as "Set up another" from the switcher, so Back appears only
 * when there is a workspace to go back to. A first one has nowhere behind it
 * — the account was just verified — and the way out is signing out, which
 * the form offers under its button.
 *
 * What the business does is not asked here any more: that is chosen from
 * Home, where each capability can be seen for what it is. What is being set
 * up — a business, just me, or a site for my work (DEC-070) — is asked, as
 * the form's first question, and the form speaks in its words. The page
 * around it stays neutral: it is drawn before the answer is given.
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
    const maybeLeft = leftBusinessNotice({
        activeId,
        activeName: jar.get(ACTIVE_ORG_NAME_COOKIE)?.value,
        memberOf: organizations.map((o) => o.id),
    });
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
                <SplitPanel
                    eyebrow={hasOrgs ? "Set up another" : "Last step"}
                    heading="Then you are in."
                    body="Name it and Saroh opens. You decide what it does from inside, where you can see what each thing actually is."
                    points={[
                        // True: name, type and country change in Business
                        // settings, and the web address in its Web address
                        // card, where a change breaks saved links (UX-085).
                        "You can change any of it later in Settings",
                        "You are the Owner of what you create",
                        "Everything else is one tap away on Home",
                    ]}
                />
            }
        >
            <h1 className="font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                {hasOrgs ? "Set up another" : "Set up Saroh"}
            </h1>
            <p className="mb-[22px] mt-[7px] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                {hasOrgs
                    ? "It sits beside the ones you have, and you switch between them from the top of the workspace."
                    : "Last step. You can change all of this later, and you pick what Saroh does for you once you are inside."}
            </p>
            {left ? (
                <p
                    role="status"
                    className="-mt-2.5 mb-[22px] text-pretty rounded-[9px] bg-muted px-[13px] py-[11px] text-[13px] leading-[1.55] text-foreground"
                >
                    {left}
                </p>
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
