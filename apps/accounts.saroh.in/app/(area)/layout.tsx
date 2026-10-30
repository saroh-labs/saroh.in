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

export const metadata: Metadata = { title: "Your account" };

/**
 * The account area (DEC-167 step 2, DEC-199): Profile and sign-in, Billing
 * profiles and Your businesses in one frame (`AccountFrame`). Signed in
 * only. Billing profiles is in the menu for someone who owns a business or
 * a profile; when either read fails it stays in, so an outage never hides
 * the way to it.
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
            <AccountFrame name={null} email="" appUrl={getAppUrl()} showBilling>
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
        listProfiles().catch(() => null),
    ]);
    const showBilling =
        businesses === null ||
        profiles === null ||
        businesses.some((b) => b.role === "OWNER") ||
        profiles.length > 0;

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
