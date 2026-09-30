import { getServerSession } from "@saroh/auth/next";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { BusinessSetupForm } from "@/components/organizations/business-setup-form";
import { listOrganizations } from "@/lib/organizations/service";
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
 */
export default async function OnboardingPage() {
    await requireSession();
    const [session, organizations] = await Promise.all([
        getServerSession(await headers()),
        listOrganizations(),
    ]);
    const hasOrgs = organizations.length > 0;

    return (
        <SplitShell
            panel={
                <SplitPanel
                    eyebrow={hasOrgs ? "Set up another" : "Last step"}
                    heading="Then you are in."
                    body="Name it and Saroh opens. You decide what it does from inside, where you can see what each thing actually is."
                    points={[
                        // True: name, type and country all change in Business
                        // settings; the address has no editor anywhere.
                        "Nothing here is permanent except the address",
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
            <BusinessSetupForm
                email={session?.user.email ?? ""}
                backTo={hasOrgs ? "/" : undefined}
            />
        </SplitShell>
    );
}
