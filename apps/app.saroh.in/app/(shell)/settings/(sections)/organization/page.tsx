import { EmptyState } from "@saroh/ui/empty-state";

import { OrganizationSettingsForm } from "@/components/organizations/organization-settings-form";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { resolveActiveOrganization } from "@/lib/organizations/service";
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
export const metadata = { title: "Business" };

export default async function OrganizationSettingsPage() {
    await requireSession();

    const [settings, organization] = await Promise.all([
        getOrganizationSettings(),
        resolveActiveOrganization(),
    ]);
    // From what the API resolved this person may do; the role's name is only
    // the fallback for a response that predates permissions.
    const canEdit = organization?.actions
        ? organization.actions.includes("org:update")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";

    return (
        <SettingsPanel
            header={
                <SettingsPanelHeader
                    title="Business"
                    description={
                        canEdit
                            ? "Everything customers see on receipts and invoices. Edit one section at a time — the preview shows how it prints."
                            : "What customers see on receipts and invoices."
                    }
                    readOnlyNote={
                        canEdit
                            ? undefined
                            : "Only owners and admins can change this."
                    }
                />
            }
        >
            {settings ? (
                <OrganizationSettingsForm
                    // Keyed by business: the form keeps what it last saved,
                    // so switching business must start it afresh rather
                    // than show (and save over) the last one's details.
                    key={settings.slug}
                    settings={settings}
                    canEdit={canEdit}
                />
            ) : (
                <EmptyState
                    title="Not available"
                    description="Choose an organization to view its settings."
                />
            )}
        </SettingsPanel>
    );
}
