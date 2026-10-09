import { ShareCards } from "@saroh/ui/share-cards";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { SellsFromRow } from "@/components/sites/sells-from-row";
import {
    Absent,
    Group,
    InUse,
    Row,
    Section,
} from "@/components/sites/settings-rows";
import type { PublishApproval } from "@/lib/sites/publish-approval";
import { publishApprovalLine } from "@/lib/sites/publish-approval";
import type { SiteDetail } from "@/lib/sites/service";
import {
    automaticMenu,
    publishWaiting,
    ROW_ANCHORS,
    settingsGroups,
    shareReadiness,
    siteNameOf,
} from "@/lib/sites/settings-page";
import type { SiteAddress } from "@/lib/sites/share-links";

import { AddressGroup } from "./settings/address-group";
import { PublishBar } from "./settings/publish-bar";
import { SettingsFrame } from "./settings/settings-frame";
import { ShareChecklist } from "./settings/share-checklist";

/**
 * The site's settings, for someone who may read them and not change them
 * (#275), in the same groups and words as the form (`site-settings.tsx`).
 *
 * The form renders Save, a domain connect and an image picker, all of which
 * the API refuses without `site:update`. §30: a denial is explained up front,
 * not discovered on the first press. So the values are shown and the controls
 * are absent, with one sentence saying who does have them.
 *
 * Read-only means read-only: no row here can save. Copy and View only read.
 */
export function SiteSettingsRead({
    site,
    address,
    approval = null,
    tracking = null,
}: {
    site: SiteDetail;
    /** Where the site is reached (`siteAddressOf`); null without an address. */
    address: SiteAddress | null;
    /** "Publishing needs approval" (DEC-071, T13); null leaves it out. */
    approval?: PublishApproval | null;
    /** The Tracking group's content: its own read. */
    tracking?: React.ReactNode;
}) {
    const live = Boolean(site.currentPublication);
    const groups = settingsGroups({
        shop: Boolean(site.sellsFrom),
        advanced: approval !== null,
    });
    const pagesById = new Map(site.pages.map((p) => [p.id, p]));
    const automatic = automaticMenu(site);

    return (
        <SettingsFrame groups={groups}>
            <ReadOnlyNote className="mb-0">
                Your role can read this site&apos;s settings but not change
                them. A connected domain isn&apos;t shown: reading it needs the
                domain permission.
            </ReadOnlyNote>

            <ShareChecklist steps={shareReadiness(site)} live={live} />

            <AddressGroup
                address={address}
                live={live}
                canChangeAddress={false}
            />

            <Group id="search-and-sharing" title="Search and sharing">
                <Section>
                    <Row id={ROW_ANCHORS.title} label="Title" draft>
                        {site.seoTitle?.trim() ? (
                            site.seoTitle
                        ) : (
                            <InUse
                                value={siteNameOf(site)}
                                source="your site's name"
                            />
                        )}
                    </Row>
                    <Row id={ROW_ANCHORS.description} label="Description" draft>
                        {site.seoDescription?.trim() ? (
                            <span className="[overflow-wrap:anywhere]">
                                {site.seoDescription}
                            </span>
                        ) : (
                            <Absent>Not written</Absent>
                        )}
                    </Row>
                    <Row id={ROW_ANCHORS.image} label="Share image" draft>
                        {site.socialImageUrl ? (
                            <span className="break-all text-xs text-muted-foreground">
                                {site.socialImageUrl}
                            </span>
                        ) : (
                            <Absent>None</Absent>
                        )}
                    </Row>
                    <Row label="When shared">
                        <ShareCards
                            fold
                            title={
                                site.seoTitle?.trim()
                                    ? site.seoTitle
                                    : site.name
                            }
                            description={site.seoDescription ?? ""}
                            siteName={site.name}
                            domain={address?.host ?? null}
                            image={
                                site.socialImageUrl
                                    ? {
                                          url: site.socialImageUrl,
                                          width: site.socialImageWidth,
                                          height: site.socialImageHeight,
                                          bytes: site.socialImageBytes,
                                      }
                                    : null
                            }
                            liveUrl={live && address ? address.url : null}
                        />
                    </Row>
                </Section>
            </Group>

            <Group id="menu-and-footer" title="Menu and footer">
                <Section>
                    <Row id={ROW_ANCHORS.menu} label="Menu" draft>
                        {site.navigation ? (
                            site.navigation.items
                                .map(
                                    (i) =>
                                        i.label ??
                                        pagesById.get(i.pageId)?.title ??
                                        "?",
                                )
                                .join(" · ")
                        ) : (
                            <span>
                                <Absent>Not built</Absent>
                                {automatic.length ? (
                                    <span className="text-muted-foreground">
                                        {" "}
                                        · {automatic.join(" · ")}{" "}
                                        {automatic.length === 1
                                            ? "shows"
                                            : "show"}{" "}
                                        on their own
                                    </span>
                                ) : null}
                            </span>
                        )}
                    </Row>
                    <Row label="Footer" draft>
                        {site.footer?.value.trim() ? (
                            <span className="whitespace-pre-wrap break-words text-muted-foreground">
                                {site.footer.value}
                            </span>
                        ) : (
                            <Absent>Not written</Absent>
                        )}
                    </Row>
                    <Row label="Posts path" draft>
                        <span>
                            /{site.postsPrefix ?? "blog"}
                            <span className="text-muted-foreground">
                                {" "}
                                · where your posts live
                            </span>
                        </span>
                    </Row>
                </Section>
            </Group>

            {site.sellsFrom ? (
                <Group id="shop" title="Shop">
                    <SellsFromRow
                        siteId={site.id}
                        sellsFrom={site.sellsFrom}
                        canChange={false}
                        awaiting={site.shopAwaitsSellsFrom === true}
                    />
                </Group>
            ) : null}

            <Group id="tracking" title="Tracking">
                {tracking}
            </Group>

            {approval ? (
                <Group id="advanced" title="Advanced">
                    <Section title="Publishing">
                        <Row label="Needs approval">
                            {publishApprovalLine(approval.on)}
                        </Row>
                    </Section>
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
