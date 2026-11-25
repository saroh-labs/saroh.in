"use client";

import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

import { LimitNoticeBlock } from "@/components/billing/limit-notice";
import { OrganizationSettingsForm } from "@/components/organizations/business-settings/organization-settings-form";
import { TeamScreen } from "@/components/organizations/team/team-screen";
import { WebAddressSection } from "@/components/organizations/web-address/web-address-section";
import { SettingsLoading } from "@/components/settings/page/settings-loading";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { YourProfile } from "@/components/settings/profile/your-profile";
import {
    ReadyChecklist,
    readyHasCard,
} from "@/components/settings/ready/ready-checklist";
import { ShowSetupOnHome } from "@/components/settings/ready/show-setup-on-home";
import { SettingsColumns } from "@/components/shared/page/settings-columns";

import type { AlertPreferences } from "@/lib/notifications/preferences";
import { kindWords } from "@/lib/organizations/kind";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/time-zones";
import { useOrgId } from "@/lib/query/org";
import type { InPlaceTab, ProfileScreen } from "@/lib/settings/queries";
import { inPlaceTab, profileRead } from "@/lib/settings/queries";
import {
    useOrganizationScreen,
    usePeopleScreen,
    useProfileScreen,
    useSettingsStale,
} from "@/lib/settings/use-settings";
import { shellLiveRead } from "@/lib/shell/queries";
import { BillingContainer } from "./tabs/billing-tab";
import { Drawn } from "./tabs/drawn";
import { ModulesContainer } from "./tabs/modules-tab";
import { ProvidersContainer } from "./tabs/providers-tab";

/**
 * Team, Your profile, Business, Modules, Integrations and Plan and billing
 * on React Query (DEC-259). Each tab's
 * page checks its gate and the read loads here; between these three the side list changes the
 * address in place (`SettingsTabs`), and this draws the tab the address
 * names from the cache: a tab seen a moment ago costs no read, a new one
 * reads its route once.
 */
export function SettingsTabScreen({
    tab: served,
    kind,
}: {
    tab: InPlaceTab;
    /** What is set up (the gate's business), for Business's title at once. */
    kind: string | null;
}) {
    const tab = inPlaceTab(usePathname()) ?? served;
    if (tab === "/settings/people") return <PeopleContainer />;
    if (tab === "/settings/profile") return <ProfileContainer />;
    if (tab === "/settings/modules") return <ModulesContainer />;
    if (tab === "/settings/integrations") return <ProvidersContainer />;
    if (tab === "/settings/billing") return <BillingContainer />;
    return <OrganizationContainer kind={kind} />;
}

function PeopleContainer() {
    return (
        <Drawn
            query={usePeopleScreen()}
            section="people"
            loading={<SettingsLoading title="Team" width="full" rows={5} />}
        >
            {({ limitNotice, ...team }) => (
                <SettingsPanel width="full">
                    <TeamScreen
                        {...team}
                        limitNotice={
                            limitNotice ? (
                                <LimitNoticeBlock
                                    full={limitNotice.full}
                                    soft={limitNotice.soft}
                                    title={limitNotice.title}
                                    pct={limitNotice.pct}
                                    body={limitNotice.body}
                                    cta={limitNotice.cta}
                                    prompt={
                                        limitNotice.full
                                            ? "at_limit"
                                            : "near_limit"
                                    }
                                    href={limitNotice.href}
                                />
                            ) : null
                        }
                    />
                </SettingsPanel>
            )}
        </Drawn>
    );
}

function ProfileContainer() {
    const qc = useQueryClient();
    const orgId = useOrgId();
    const stale = useSettingsStale();
    // A save's answer goes into the cache at once, so a switch lets go on
    // what was saved, with no read of the tab again.
    const put = (patch: Partial<ProfileScreen>) =>
        qc.setQueryData(
            profileRead.key(orgId, {}),
            (d: ProfileScreen | undefined) => (d ? { ...d, ...patch } : d),
        );
    return (
        <Drawn
            query={useProfileScreen()}
            section="profile"
            loading={<SettingsLoading title="Your profile" rows={4} />}
        >
            {(profile) => (
                <SettingsPanel
                    header={<SettingsPanelHeader title="Your profile" />}
                >
                    <YourProfile
                        {...profile}
                        save={{
                            orgId,
                            alerts: (prefs: AlertPreferences) => {
                                put({ alerts: { status: "ok", prefs } });
                                // The bell counts what you hear about.
                                void qc.invalidateQueries({
                                    queryKey: shellLiveRead.key(orgId, {}),
                                });
                            },
                            sharesUsage: (on) => put({ sharesUsage: on }),
                            // The photo keeps its own copy; nothing else shows it.
                            photo: stale,
                        }}
                    />
                </SettingsPanel>
            )}
        </Drawn>
    );
}

function OrganizationContainer({ kind }: { kind: string | null }) {
    return (
        <Drawn
            query={useOrganizationScreen()}
            section="organization"
            loading={
                <SettingsLoading
                    title={kindWords(kind).settingsTab}
                    width="full"
                    rows={6}
                />
            }
        >
            {(org) => {
                const { settings } = org;
                return (
                    <SettingsPanel
                        width="full"
                        header={
                            <SettingsPanelHeader
                                holdsData={false}
                                // The settings read has the kind as saved;
                                // the business list is the fallback.
                                title={
                                    kindWords(
                                        settings?.kind ?? org.kind ?? kind,
                                    ).settingsTab
                                }
                                readOnlyNote={
                                    org.canEdit
                                        ? undefined
                                        : "Only owners and admins can change this."
                                }
                            />
                        }
                    >
                        <SettingsColumns
                            // The Settings side list is already beside the rows.
                            beside
                            aside={
                                org.ready && readyHasCard(org.ready) ? (
                                    <div className="grid gap-2.5">
                                        <ReadyChecklist
                                            list={org.ready}
                                            businessId={
                                                org.businessId ?? undefined
                                            }
                                            canChangePlan={org.canChangePlan}
                                        />
                                        {/* Hidden on Home: the way back (A4). */}
                                        {settings ? (
                                            <ShowSetupOnHome
                                                businessId={settings.id}
                                            />
                                        ) : null}
                                    </div>
                                ) : undefined
                            }
                        >
                            {settings ? (
                                <OrganizationSettingsForm
                                    // Keyed by business: the form keeps what
                                    // it last saved, so another business
                                    // starts it afresh.
                                    key={settings.slug}
                                    settings={settings}
                                    canEdit={org.canEdit}
                                    hours={org.hours}
                                    canEditHours={org.canEditHours}
                                    webAddress={
                                        <WebAddressSection
                                            read={org.webAddress}
                                            zone={
                                                settings.profile?.timezone ??
                                                DEFAULT_TIMEZONE
                                            }
                                        />
                                    }
                                />
                            ) : (
                                <FailedState
                                    title={couldntLoad("your business details")}
                                    retryHref="/settings/organization"
                                />
                            )}
                        </SettingsColumns>
                    </SettingsPanel>
                );
            }}
        </Drawn>
    );
}
