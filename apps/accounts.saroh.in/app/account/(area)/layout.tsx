import { resolveServerSession } from "@saroh/auth/next";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AccountFrame } from "@/components/account-area/account-frame";
import { getAppUrl } from "@/lib/app-urls";
import { listProfiles } from "@/lib/billing-profiles.server";
import { listBusinesses } from "@/lib/businesses";

// Profile and sign-in is a client page, which can't name itself: without
// this its tab read "Sign in · Saroh" to someone already signed in. Billing
// profiles' pages name their own.
export const metadata: Metadata = { title: "Your account" };

/**
 * The account area (DEC-167 step 2): Profile and sign-in and Billing
 * profiles in one frame (`AccountFrame`). Signed in only. Billing profiles
 * is in the menu for someone who owns a business or a profile; when either
 * read fails it stays in, so an outage never hides the way to it.
 */
export default async function AccountAreaLayout({
    children,
}: {
    children: ReactNode;
}) {
    const result = await resolveServerSession(await headers());
    if (result.status === "anonymous") redirect("/login?redirect=/account");
    if (result.status === "unavailable") {
        throw new Error("Could not check your session. Try again in a moment.");
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
