import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";

import { OrganizationSettingsForm } from "@/components/organizations/organization-settings-form";
import { PageContainer } from "@/components/shared/page-container";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Organization. The tenant's own identity (name + business profile),
 * which until now was write-once at onboarding with no edit path in the product
 * OR the API — so a typo in the legal name was permanent, and visible on
 * published sites.
 *
 * OWNER/ADMIN only, enforced by the API (`org:settings:read` / `org:update`). A
 * role denial reaches forbidden.tsx; an unavailable API reaches error.tsx.
 */
export const metadata = { title: "Organization" };

export default async function OrganizationSettingsPage() {
    await requireSession();

    const settings = await getOrganizationSettings();

    return (
        <PageContainer width="form">
            <PageHeader
                title="Organization"
                description="Your workspace name and the business identity used across Saroh."
            />
            {settings ? (
                <OrganizationSettingsForm settings={settings} />
            ) : (
                <EmptyState
                    title="Not available"
                    description="Choose an organization to view its settings."
                />
            )}
        </PageContainer>
    );
}
