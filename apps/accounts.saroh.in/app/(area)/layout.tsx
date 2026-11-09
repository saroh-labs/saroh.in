import { resolveServerSession } from "@saroh/auth/next";
import { FailedState } from "@saroh/ui/data-state";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AccountFrame } from "@/components/account-area/account-frame";
import { getAppUrl } from "@/lib/app-urls";
import { listProfiles } from "@/lib/billing-profiles.server";
import { listBusinesses } from "@/lib/businesses";
import { SAROH_BILLING, billingInMenu } from "@/lib/saroh-billing";

export const metadata: Metadata = { title: "Your account" };

/**
 * The account area (DEC-167 step 2, DEC-199): Profile and sign-in, Billing
 * profiles and Your businesses in one frame (`AccountFrame`). Signed in
 * only. Billing profiles is in the menu by `billingInMenu`: never on an
 * edition Saroh doesn't bill (Global), else for an owner of a business or a
 * profile, and while a read fails.
 *
 * When the session can't be checked (the API is down), the cookie is still
 * there: the person is signed in and Saroh is unreachable. The frame says
 * so with a Try again, never the sign-in page (UX audit, 28 Oct).
 */
export default async function AccountAreaLayout({
    children,
}: {
    children: ReactNode;
}) {
    const result = await resolveServerSession(await headers());
    if (result.status === "anonymous") redirect("/login?redirect=/account");
    if (result.status === "unavailable") {
        return (
            <AccountFrame
                name={null}
                email=""
                appUrl={getAppUrl()}
                showBilling={SAROH_BILLING}
            >
                <FailedState
                    size="page"
                    title="Couldn't reach Saroh"
                    description="Nothing has been changed. It's usually back in a moment."
                    retryHref="/account"
                />
            </AccountFrame>
        );
    }
    const { user } = result.session;
    const [businesses, profiles] = await Promise.all([
        listBusinesses().catch(() => null),
        SAROH_BILLING ? listProfiles().catch(() => null) : [],
    ]);
    const showBilling = billingInMenu(businesses, profiles);

    return (
        <AccountFrame
            name={user.name ?? null}
            email={user.email}
            appUrl={getAppUrl()}
            showBilling={showBilling}
        >
            {children}
        </AccountFrame>
    );
}
