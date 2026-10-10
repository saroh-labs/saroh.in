"use client";

import { ShareCards } from "@saroh/ui/share-cards";
import { useState } from "react";

import {
    Absent,
    Group,
    InUse,
    Row,
    Section,
} from "@/components/sites/settings-rows";
import { updateSiteSettings } from "@/lib/sites/actions";
import type { SiteDetail } from "@/lib/sites/service";
import { ROW_ANCHORS, siteNameOf } from "@/lib/sites/settings-page";
import type { SiteAddress } from "@/lib/sites/share-links";

import { EditAction } from "./edit-actions";
import type { SearchSharingSaved } from "./search-sharing-sheets";
import {
    DescriptionSheet,
    ShareImageSheet,
    TitleSheet,
} from "./search-sharing-sheets";
import { ShareImageThumb } from "./share-image-thumb";
import type { SettingsSave } from "./use-settings-save";
import { shareImageOf } from "./use-share-image";

/**
 * Search and sharing: the search title, the description and the share
 * image, then how the link looks where it is shared. All three are part of
 * the draft ("Next publish").
 *
 * Each row says what is saved and its Edit opens the row's sheet, where
 * the length is counted and the link's card drawn as it is typed. A save
 * shows in the row at once (`saved`), before the page reads again.
 *
 * Each row shows what the live site uses. The title falls back to the
 * site's name, as the renderer's `<title>` does, so it reads "Rye · your
 * site's name", never "Nothing set yet". A description and a share image
 * have no stand-in, so they say "Not written" and "None".
 */
export function SearchSharingGroup({
    site,
    address,
    live,
    state,
}: {
    site: SiteDetail;
    address: SiteAddress | null;
    live: boolean;
    state: SettingsSave;
}) {
    // What the rows say: the site's own, then each save as it lands.
    const [saved, setSaved] = useState<SearchSharingSaved>({
        seoTitle: site.seoTitle ?? "",
        seoDescription: site.seoDescription ?? "",
        image: shareImageOf(site),
    });
    const { editing, run, pending, close } = state;
    const name = siteNameOf(site);

    const save = (
        input: Parameters<typeof updateSiteSettings>[1],
        label: string,
        next: Partial<SearchSharingSaved>,
    ) =>
        run(
            () => updateSiteSettings(site.id, input),
            `${label} saved. Publish to make it public.`,
            () => setSaved((s) => ({ ...s, ...next })),
        );

    const { seoTitle, seoDescription, image } = saved;
    const sheet = {
        saved,
        siteName: site.name,
        domain: address?.host ?? null,
        open: editing?.open ?? false,
        pending,
        onClose: close,
    };

    return (
        <Group id="search-and-sharing" title="Search and sharing">
            <Section>
                <Row
                    id={ROW_ANCHORS.title}
                    label="Title"
                    draft
                    action={
                        <EditAction
                            row="title"
                            state={state}
                            name="Edit title"
                        />
                    }
                >
                    {seoTitle ? (
                        <span className="[overflow-wrap:anywhere]">
                            {seoTitle}
                        </span>
                    ) : (
                        <InUse value={name} source="your site's name" />
                    )}
                </Row>

                <Row
                    id={ROW_ANCHORS.description}
                    label="Description"
                    draft
                    action={
                        <EditAction
                            row="description"
                            state={state}
                            label={seoDescription ? "Edit" : "Write"}
                            name={
                                seoDescription
                                    ? "Edit description"
                                    : "Write description"
                            }
                        />
                    }
                >
                    {seoDescription ? (
                        <span className="[overflow-wrap:anywhere]">
                            {seoDescription}
                        </span>
                    ) : (
                        <Absent>Not written</Absent>
                    )}
                </Row>

                <Row
                    id={ROW_ANCHORS.image}
                    label="Share image"
                    draft
                    action={
                        <EditAction
                            row="image"
                            state={state}
                            label={image.url ? "Replace" : "Add"}
                            name={
                                image.url
                                    ? "Replace share image"
                                    : "Add share image"
                            }
                        />
                    }
                >
                    <div className="flex items-center gap-3">
                        <ShareImageThumb url={image.url} />
                        <div className="min-w-0 text-xs">
                            {image.url ? (
                                <span className="break-all text-muted-foreground">
                                    {image.url}
                                </span>
                            ) : (
                                <>
                                    <Absent>None</Absent>
                                    <p className="text-muted-foreground">
                                        1200×630 works everywhere.
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </Row>

                {/* What the link looks like when it is posted (#220), drawn
                    from what the rows above have saved. WhatsApp first; the
                    other apps fold. */}
                <Row label="When shared">
                    <ShareCards
                        fold
                        title={seoTitle || site.name}
                        description={seoDescription}
                        siteName={site.name}
                        domain={address?.host ?? null}
                        image={
                            image.url
                                ? { url: image.url, ...image.facts }
                                : null
                        }
                        liveUrl={live && address ? address.url : null}
                    />
                </Row>
            </Section>

            {/* The open sheet, a fresh draft each time it opens. */}
            {editing?.which === "title" ? (
                <TitleSheet
                    key={editing.opened}
                    {...sheet}
                    name={name}
                    onSave={(next) =>
                        save({ seoTitle: next || null }, "Title", {
                            seoTitle: next,
                        })
                    }
                />
            ) : null}
            {editing?.which === "description" ? (
                <DescriptionSheet
                    key={editing.opened}
                    {...sheet}
                    onSave={(next) =>
                        save({ seoDescription: next || null }, "Description", {
                            seoDescription: next,
                        })
                    }
                />
            ) : null}
            {editing?.which === "image" ? (
                <ShareImageSheet
                    key={editing.opened}
                    {...sheet}
                    onSave={(input, next) =>
                        save(input, "Share image", { image: next })
                    }
                />
            ) : null}
        </Group>
    );
}
