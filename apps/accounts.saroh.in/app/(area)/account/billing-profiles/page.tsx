import type { Metadata } from "next";

import {
    ListHead,
    ProfileList,
} from "@/components/billing-profiles/profile-list";
import {
    EmptyProfiles,
    FailedProfiles,
    OwnerNoProfile,
    TeammateState,
} from "@/components/billing-profiles/states";
import { getOnboardingUrl } from "@/lib/app-urls";
import type { BillingProfile, OwnedBusiness } from "@/lib/billing-profiles";
import { listProfiles, ownedBusinesses } from "@/lib/billing-profiles.server";
import type { Business } from "@/lib/businesses";
import { listBusinesses } from "@/lib/businesses";

export const metadata: Metadata = {
    title: "Billing profiles",
    description: "Who Saroh bills for each business you own.",
};

/**
 * Billing profiles (DEC-167 step 2, F1/F7): every profile the signed-in
 * owner has and what each pays for. Nobody else's is ever listed (the API
 * filters by the session). A teammate who owns no business and no profile
 * reads whose billing it is; an owner whose business has none adds one
 * here; someone with neither reads how the first one is made.
 */
export default async function BillingProfilesPage({
    searchParams,
}: {
    searchParams: Promise<{ add?: string; bill?: string }>;
}) {
    const { add, bill } = await searchParams;
    let profiles: BillingProfile[];
    let owned: OwnedBusiness[];
    let businesses: Business[];
    try {
        [profiles, owned, businesses] = await Promise.all([
            listProfiles(),
            ownedBusinesses(),
            listBusinesses(),
        ]);
    } catch {
        return (
            <div className="flex max-w-[760px] flex-col gap-6">
                <ListHead />
                <FailedProfiles />
            </div>
        );
    }

    if (profiles.length === 0) {
        const teamOf = businesses
            .filter((b) => b.role !== "OWNER")
            .map((b) => b.name);
        const teammate = owned.length === 0 && teamOf.length > 0;
        return (
            <div className="flex max-w-[760px] flex-col gap-6">
                <ListHead teammate={teammate} />
                {teammate ? (
                    <TeammateState businesses={teamOf} />
                ) : owned.length > 0 ? (
                    <OwnerNoProfile businesses={owned} />
                ) : (
                    <EmptyProfiles createUrl={getOnboardingUrl()} />
                )}
            </div>
        );
    }

    return (
        <ProfileList
            profiles={profiles}
            businesses={owned}
            startAdding={add === "1"}
            startBilling={
                add === "1" && owned.some((b) => b.id === bill)
                    ? bill
                    : undefined
            }
        />
    );
}
