"use client";

import { Input } from "@saroh/ui/input";
import { ShareCards, webImageUrl } from "@saroh/ui/share-cards";
import { Textarea } from "@saroh/ui/textarea";
import { ImageIcon } from "lucide-react";
import { useState } from "react";

import { MediaPicker } from "@/components/sites/media-picker";
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

import { EditActions } from "./edit-actions";
import type { SettingsSave } from "./use-settings-save";
import { useShareImage } from "./use-share-image";

/** Search engines truncate around here. Guidance, never enforcement. */
const TITLE_GUIDE = 60;
const DESCRIPTION_GUIDE = 155;

/** "12 of about 60 characters", or the aim once past it. */
function lengthLine(length: number, guide: number): string {
    return length > guide
        ? `Aim for ${guide} characters or fewer. Currently ${length}.`
        : `${length} of about ${guide} characters.`;
}

/**
 * Search and sharing: the search title, the description and the share
 * image, then how the link looks where it is shared. All three are part of
 * the draft ("Next publish").
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
    const [seoTitle, setSeoTitle] = useState(site.seoTitle ?? "");
    const [seoDescription, setSeoDescription] = useState(
        site.seoDescription ?? "",
    );
    const image = useShareImage(site);
    const { editing, run } = state;
    const name = siteNameOf(site);

    const save = (
        row: "title" | "description" | "social",
        input: Parameters<typeof updateSiteSettings>[1],
        label: string,
    ) =>
        run(
            row,
            () => updateSiteSettings(site.id, input),
            `${label} saved. Publish to make it public.`,
        );

    return (
        <Group id="search-and-sharing" title="Search and sharing">
            <Section>
                <Row
                    id={ROW_ANCHORS.title}
                    label="Title"
                    draft
                    action={
                        <EditActions
                            row="title"
                            state={state}
                            onSave={() =>
                                save(
                                    "title",
                                    { seoTitle: seoTitle || null },
                                    "Title",
                                )
                            }
                            onCancel={() => setSeoTitle(site.seoTitle ?? "")}
                        />
                    }
                >
                    {editing === "title" ? (
                        <div className="space-y-1">
                            <Input
                                value={seoTitle}
                                autoFocus
                                placeholder={name}
                                onChange={(e) => setSeoTitle(e.target.value)}
                                aria-label="Search title"
                            />
                            <p className="text-xs text-muted-foreground">
                                {seoTitle
                                    ? lengthLine(seoTitle.length, TITLE_GUIDE)
                                    : `Left empty, your site's name is used: ${name}.`}
                            </p>
                        </div>
                    ) : seoTitle ? (
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
                        <EditActions
                            row="description"
                            state={state}
                            editLabel={seoDescription ? "Edit" : "Write"}
                            onSave={() =>
                                save(
                                    "description",
                                    { seoDescription: seoDescription || null },
                                    "Description",
                                )
                            }
                            onCancel={() =>
                                setSeoDescription(site.seoDescription ?? "")
                            }
                        />
                    }
                >
                    {editing === "description" ? (
                        <div className="space-y-1">
                            <Textarea
                                value={seoDescription}
                                rows={3}
                                autoFocus
                                onChange={(e) =>
                                    setSeoDescription(e.target.value)
                                }
                                aria-label="Search description"
                            />
                            <p className="text-xs text-muted-foreground">
                                {lengthLine(
                                    seoDescription.length,
                                    DESCRIPTION_GUIDE,
                                )}
                            </p>
                        </div>
                    ) : seoDescription ? (
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
                        <EditActions
                            row="social"
                            state={state}
                            editLabel={image.url ? "Replace" : "Add"}
                            onSave={() =>
                                save("social", image.input, "Share image")
                            }
                            onCancel={image.reset}
                        />
                    }
                >
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted text-muted-foreground">
                                {webImageUrl(image.url) ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL, not a project asset
                                    <img
                                        src={webImageUrl(image.url) ?? ""}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <ImageIcon
                                        aria-hidden
                                        className="h-4 w-4"
                                    />
                                )}
                            </div>
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
                        {editing === "social" ? (
                            <div className="grid gap-1.5">
                                <MediaPicker
                                    onPick={(img) => image.choose(img.src, img)}
                                />
                                <Input
                                    value={image.url}
                                    placeholder="or paste an image address"
                                    onChange={(e) =>
                                        image.choose(e.target.value)
                                    }
                                    aria-label="Share image address"
                                />
                            </div>
                        ) : null}
                    </div>
                </Row>

                {/* What the link looks like when it is posted (#220), drawn
                    from the rows above as they are typed. WhatsApp first;
                    the other apps fold. */}
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
        </Group>
    );
}
