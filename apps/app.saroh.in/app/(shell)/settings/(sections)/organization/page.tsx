import { EmptyState } from "@saroh/ui/empty-state";

import { OrganizationSettingsForm } from "@/components/organizations/organization-settings-form";
import { WebAddressSection } from "@/components/organizations/web-address-section";
import { ReadyChecklist } from "@/components/settings/ready-checklist";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { kindWords } from "@/lib/organizations/kind";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/time-zones";
import { readWebAddress } from "@/lib/organizations/web-address-service";
import { requireSession } from "@/lib/session";
import { loadSettingsChecklist } from "@/lib/settings/ready-service";
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
 * Under Identity, the business's web address (DEC-069, L4): the owner
 * changes it there, and everyone else who can see it reads it.
 *
 * Above the tabs, for someone who may change things, "Ready to take
 * payments": what is left to set up — Home's steps, then the email, business
 * type, logo and pipeline nudges (`loadSettingsChecklist`, DEC-056). Its
 * extra reads are best-effort — one that fails drops its steps, never the
 * page.
 *
 * Named in the words of what is being set up (DEC-070, K5): "Business" for
 * a business, "Your details" for Just me and A site for my work. Identity
 * is where that is changed.
 */
export async function generateMetadata() {
    const organization = await resolveActiveOrganization();
    return { title: kindWords(organization?.kind).settingsTab };
}

export default async function OrganizationSettingsPage() {
    await requireSession();

    // The Hours tab reads the storefronts, where opening hours are kept; a
    // refusal there is said on that tab, never the whole page.
    // The web address (DEC-069, L4) is its own read: one that fails is
    // said on its card, never the whole page.
    const [settings, organization, hours, webAddress] = await Promise.all([
        getOrganizationSettings(),
        resolveActiveOrganization(),
        listStorefrontHours(),
        readWebAddress(),
    ]);
    // From what the API resolved this person may do; the role's name is only
    // the fallback for a response that predates permissions.
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const canEdit = may("org:update");

    // Home's "Get ready to take money" steps, and what Settings adds.
    const ready =
        settings && canEdit
            ? await loadSettingsChecklist(settings, may("comms:manage"))
            : null;

    return (
        <SettingsPanel
            header={
                <>
                    <SettingsPanelHeader
                        // The settings read has the kind as saved; the
                        // organization list is the fallback.
                        title={
                            kindWords(settings?.kind ?? organization?.kind)
                                .settingsTab
                        }
                        readOnlyNote={
                            canEdit
                                ? undefined
                                : "Only owners and admins can change this."
                        }
                    />
                    {ready ? <ReadyChecklist list={ready} /> : null}
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
                    webAddress={
                        <WebAddressSection
                            read={webAddress}
                            zone={
                                settings.profile?.timezone ?? DEFAULT_TIMEZONE
                            }
                        />
                    }
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
