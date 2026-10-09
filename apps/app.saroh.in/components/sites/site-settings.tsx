"use client";

import { CustomDomain } from "@/components/sites/custom-domain";
import { PublishApprovalSection } from "@/components/sites/publish-approval-row";
import { SellsFromRow } from "@/components/sites/sells-from-row";
import { Group } from "@/components/sites/settings-rows";
import type { PublishApproval } from "@/lib/sites/publish-approval";
import type { SiteDetail } from "@/lib/sites/service";
import {
    publishWaiting,
    settingsGroups,
    shareReadiness,
} from "@/lib/sites/settings-page";
import type { SiteAddress } from "@/lib/sites/share-links";

import { AddressGroup } from "./settings/address-group";
import { MenuFooterGroup } from "./settings/menu-footer-group";
import { PublishBar } from "./settings/publish-bar";
import { SearchSharingGroup } from "./settings/search-sharing-group";
import { SettingsFrame } from "./settings/settings-frame";
import { ShareChecklist } from "./settings/share-checklist";
import { useSettingsSave } from "./settings/use-settings-save";

/**
 * A site's Settings tab (#188), regrouped after the Website › Settings
 * audit (9 Oct 2026): what's left before the site is worth sharing first,
 * then six groups — Address, Search and sharing, Menu and footer, Shop,
 * Tracking, Advanced — with a list of them beside the column on a wide
 * screen.
 *
 * Saving is per row; there is no page-level Save, because a settings form
 * that saves everything at once lets a stale tab overwrite a field someone
 * else changed. Rows apply as soon as they are saved unless they carry
 * "Next publish": those are draft, and the bar at the foot says what
 * waits for the next publish, from the API's own count.
 */
export function SiteSettings({
    site,
    address,
    approval = null,
    canChangeAddress = false,
    tracking = null,
}: {
    site: SiteDetail;
    /**
     * Where the site is reached (`siteAddressOf`, DEC-069 L8): its verified
     * domain when the business has one, and its web address on Saroh beside
     * it. Null for a site with no address yet.
     */
    address: SiteAddress | null;
    /** "Publishing needs approval" (DEC-071, T13); null leaves it out. */
    approval?: PublishApproval | null;
    /** The owner may change the web address (`WEB_ADDRESS_CHANGE` on). */
    canChangeAddress?: boolean;
    /** The Tracking group's content: its own read, in a Suspense boundary. */
    tracking?: React.ReactNode;
}) {
    const state = useSettingsSave();
    const live = Boolean(site.currentPublication);
    const shop = Boolean(site.sellsFrom);
    const groups = settingsGroups({ shop, advanced: approval !== null });

    return (
        <SettingsFrame groups={groups}>
            <ShareChecklist
                steps={shareReadiness(site)}
                live={live}
                onJump={(key) =>
                    state.setEditing(key === "image" ? "social" : key)
                }
            />

            <AddressGroup
                address={address}
                live={live}
                canChangeAddress={canChangeAddress}
                domain={<CustomDomain siteId={site.id} />}
            />

            <SearchSharingGroup
                site={site}
                address={address}
                live={live}
                state={state}
            />

            <MenuFooterGroup site={site} address={address} state={state} />

            {/* Where the shop sells from (G11): only while it is open. */}
            {site.sellsFrom ? (
                <Group id="shop" title="Shop">
                    <SellsFromRow
                        siteId={site.id}
                        sellsFrom={site.sellsFrom}
                        canChange={site.can.manageSettings}
                        awaiting={site.shopAwaitsSellsFrom === true}
                    />
                </Group>
            ) : null}

            <Group id="tracking" title="Tracking">
                {tracking}
            </Group>

            {approval ? (
                <Group id="advanced" title="Advanced">
                    <PublishApprovalSection
                        siteId={site.id}
                        approval={approval}
                    />
                </Group>
            ) : null}

            <PublishBar
                waiting={publishWaiting(site)}
                editorHref={`/sites/${site.id}`}
                canPublish={site.can.publish}
            />
        </SettingsFrame>
    );
}
