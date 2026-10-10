"use client";

import { useState } from "react";

import { CustomDomain } from "@/components/sites/custom-domain";
import { PublishApprovalSection } from "@/components/sites/publish-approval-row";
import { SellsFromRow } from "@/components/sites/sells-from-row";
import { Group } from "@/components/sites/settings-rows";
import type { PublishApproval } from "@/lib/sites/publish-approval";
import type { SiteDetail } from "@/lib/sites/service";
import { groupOfSheet } from "@/lib/sites/settings-edit";
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
import { SettingsSections } from "./settings/settings-sections";
import { useSettingsSave } from "./settings/use-settings-save";

/**
 * A site's Settings tab (#188), regrouped after the Website › Settings
 * audit (9 Oct 2026): the groups (Address, Search and sharing, Menu and
 * footer, Shop, Tracking, Advanced) chosen from a side list, or a select
 * on a phone, with what's left before the site is worth sharing at the
 * top of the content (`settings-sections.tsx`).
 *
 * Read first (owner, 10 Oct): every row says what is saved, and its Edit
 * opens that row's own sheet with one Save, one sheet at a time
 * (`useSettingsSave`). Nothing is edited in the row, and nothing sends the
 * merchant to another page to finish: a checklist step, a link with
 * `?edit=` and the readiness step's `#sells-from` all open the sheet here.
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
    // A link can't open a sheet with nothing in it: no shop to choose a
    // location for, or no location that sells anything yet.
    const state = useSettingsSave((which) =>
        which === "sells-from" && !site.sellsFrom?.choices.length
            ? null
            : which,
    );
    // The sheet a link opened on arrival; its group is the one shown.
    const [arrivedAt] = useState(state.editing?.which ?? null);
    const live = Boolean(site.currentPublication);
    const shop = Boolean(site.sellsFrom);
    const groups = settingsGroups({ shop, advanced: approval !== null });

    return (
        <SettingsSections
            groups={groups}
            steps={shareReadiness(site)}
            live={live}
            canEdit
            onJump={state.open}
            startOn={arrivedAt ? groupOfSheet(arrivedAt) : null}
            onArrive={state.open}
            panels={{
                address: (
                    <AddressGroup
                        address={address}
                        live={live}
                        canChangeAddress={canChangeAddress}
                        domain={
                            <CustomDomain
                                siteId={site.id}
                                sheet={state.control("domain")}
                            />
                        }
                    />
                ),
                "search-and-sharing": (
                    <SearchSharingGroup
                        site={site}
                        address={address}
                        live={live}
                        state={state}
                    />
                ),
                "menu-and-footer": (
                    <MenuFooterGroup
                        site={site}
                        address={address}
                        state={state}
                    />
                ),
                // Where the shop sells from (G11): only while it is open.
                shop: site.sellsFrom ? (
                    <Group id="shop" title="Shop">
                        <SellsFromRow
                            siteId={site.id}
                            sellsFrom={site.sellsFrom}
                            canChange={site.can.manageSettings}
                            awaiting={site.shopAwaitsSellsFrom === true}
                            sheet={state.control("sells-from")}
                        />
                    </Group>
                ) : null,
                tracking: (
                    <Group id="tracking" title="Tracking">
                        {tracking}
                    </Group>
                ),
                advanced: approval ? (
                    <Group id="advanced" title="Advanced">
                        <PublishApprovalSection
                            siteId={site.id}
                            approval={approval}
                        />
                    </Group>
                ) : null,
            }}
            footer={
                <PublishBar
                    waiting={publishWaiting(site)}
                    editorHref={`/sites/${site.id}`}
                    canPublish={site.can.publish}
                />
            }
        />
    );
}
