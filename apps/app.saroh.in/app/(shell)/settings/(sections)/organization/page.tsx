import { EmptyState } from "@saroh/ui/empty-state";

import { OrganizationSettingsForm } from "@/components/organizations/organization-settings-form";
import { ReadyChecklist } from "@/components/settings/ready-checklist";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { listModules } from "@/lib/modules/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import { listCommsProviders } from "@/lib/providers/service";
import { requireSession } from "@/lib/session";
import { readyChecklist } from "@/lib/settings/ready";
import { listStorefrontHours } from "@/lib/stores/storefronts";

/**
 * Settings → Organization. The tenant's own identity (name + business profile),
 * which until now was write-once at onboarding with no edit path in the product
 * OR the API — so a typo in the legal name was permanent, and visible on
 * published sites.
 *
 * OWNER/ADMIN only, enforced by the API (`org:settings:read` / `org:update`). A
 * role denial reaches forbidden.tsx; an unavailable API reaches error.tsx.
 *
 * Above the tabs, for someone who may change things, "Ready to take
 * payments": what is left to set up (`readyChecklist`). Its extra reads are
 * best-effort — one that fails drops its step, never the page.
 */
export const metadata = { title: "Business" };

export default async function OrganizationSettingsPage() {
    await requireSession();

    // The Hours tab reads the storefronts, where opening hours are kept; a
    // refusal there is said on that tab, never the whole page.
    const [settings, organization, hours] = await Promise.all([
        getOrganizationSettings(),
        resolveActiveOrganization(),
        listStorefrontHours(),
    ]);
    // From what the API resolved this person may do; the role's name is only
    // the fallback for a response that predates permissions.
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const canEdit = may("org:update");

    const [modules, messaging] =
        settings && canEdit
            ? await Promise.all([
                  listModules().catch(() => null),
                  // Asked only of someone the API lets read it: a refusal
                  // there would render this whole page as forbidden.
                  may("comms:manage")
                      ? listCommsProviders().catch(() => null)
                      : Promise.resolve(null),
              ])
            : [null, null];

    return (
        <SettingsPanel
            header={
                <>
                    <SettingsPanelHeader
                        title="Business"
                        readOnlyNote={
                            canEdit
                                ? undefined
                                : "Only owners and admins can change this."
                        }
                    />
                    {settings && canEdit ? (
                        <ReadyChecklist
                            list={readyChecklist({
                                settings,
                                modules,
                                messaging,
                            })}
                        />
                    ) : null}
                </>
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
                    hours={hours}
                    canEditHours={may("store:write")}
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
