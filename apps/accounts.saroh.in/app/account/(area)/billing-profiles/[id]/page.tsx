import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfilePage } from "@/components/billing-profiles/profile-page";
import {
    FailedProfiles,
    PageTitle,
} from "@/components/billing-profiles/states";
import { ApiReadError } from "@/lib/api";
import { getAppUrl } from "@/lib/app-urls";
import type { BillingProfile, ProfileDetail } from "@/lib/billing-profiles";
import { getProfile, listProfiles } from "@/lib/billing-profiles.server";

export const metadata: Metadata = { title: "Billing profile" };

/**
 * One billing profile's page (F2Page). Only its owner's: anyone else's id,
 * or one that doesn't exist, is the not-found page (the API answers 404).
 */
export default async function BillingProfilePage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ invoices?: string }>;
}) {
    const [{ id }, { invoices }] = await Promise.all([params, searchParams]);
    const all = invoices === "all";
    let profile: ProfileDetail;
    let profiles: BillingProfile[];
    try {
        [profile, profiles] = await Promise.all([
            getProfile(id, all),
            listProfiles(),
        ]);
    } catch (error) {
        if (error instanceof ApiReadError && error.status === 404) notFound();
        return (
            <div className="flex max-w-[760px] flex-col gap-4">
                <PageTitle>Billing profile</PageTitle>
                <FailedProfiles what="this billing profile" />
            </div>
        );
    }
    return (
        <ProfilePage
            profile={profile}
            profiles={profiles}
            appUrl={getAppUrl()}
            showAll={all}
        />
    );
}
