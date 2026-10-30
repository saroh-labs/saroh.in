import { resolveServerSession } from "@saroh/auth/next";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { SoleOwned } from "@/components/account/delete-dialog";
import { ProfileRows } from "@/components/account/profile-rows";
import { apiGet } from "@/lib/api";

export const metadata: Metadata = { title: "Profile and sign-in" };

/**
 * Profile and sign-in (DEC-199): the person's own identity, read first as
 * rows, each changed in a sheet or a dialog, like Billing profiles and the
 * app's Settings. accounts.saroh.in is the one identity provider, so the
 * product apps link here and never redraw it.
 *
 * Everything acts on the SESSION USER only, never on an id from the URL.
 * The frame (`app/(area)/layout.tsx`) has already said an outage.
 */
export default async function AccountPage() {
    const result = await resolveServerSession(await headers());
    if (result.status !== "authenticated") redirect("/login?redirect=/account");
    const { user } = result.session;
    // Deleting the only owner of a business would strand it: asked first,
    // through the one API client. Unknown (null) keeps Delete from going.
    const soleOwned = await apiGet<SoleOwned[]>("/organizations/sole-owned")
        .then((orgs) => (Array.isArray(orgs) ? orgs : []))
        .catch(() => null);

    return (
        <ProfileRows
            name={user.name ?? ""}
            email={user.email}
            phoneE164={(user.phoneE164 as string | null | undefined) ?? null}
            phoneVerifiedAt={
                (user.phoneVerifiedAt as string | null | undefined) ?? null
            }
            soleOwned={soleOwned}
        />
    );
}
