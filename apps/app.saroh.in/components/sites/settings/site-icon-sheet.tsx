"use client";

import { Button } from "@saroh/ui/button";
import { useState } from "react";

import { MediaPicker } from "@/components/sites/media-picker";
import type { SiteDetail, SiteIconSaved } from "@/lib/sites/service";
import { settingsEditId } from "@/lib/sites/settings-edit";
import {
    shownSiteIcon,
    SITE_ICON_GUIDE,
    SITE_ICON_LINE,
    SITE_ICON_REMOVE,
    siteIconFileProblem,
    siteIconShapeNote,
} from "@/lib/sites/site-icon";

import { NOTE, SettingsSheetFrame } from "./settings-sheet";
import { SiteIconImage } from "./site-icon-summary";

/** The icon being chosen: an uploaded image, or none of the site's own. */
interface ChosenIcon {
    url: string;
    mediaId: string | null;
    width?: number;
    height?: number;
}

/** What the site shows without an icon of its own, said in the sheet. */
const WITHOUT = {
    logo: "Without its own icon, your site shows your business logo.",
    plain: "Without its own icon or a business logo, your site shows a plain icon with your initial.",
} as const;

/**
 * The site icon: uploaded here, shown at the sizes a browser and a phone
 * draw it, and removed here too. Nothing leaves the sheet for another
 * page, and nothing is saved until Save.
 */
export function SiteIconSheet({
    site,
    saved,
    open,
    pending,
    onClose,
    onSave,
}: {
    site: Pick<SiteDetail, "name"> &
        Partial<Pick<SiteDetail, "style" | "styleOptions">>;
    saved: SiteIconSaved;
    open: boolean;
    pending: boolean;
    onClose: () => void;
    /** The library image to set, or null to take the icon off. */
    onSave: (mediaId: string | null) => void;
}) {
    const [chosen, setChosen] = useState<ChosenIcon | null>(saved.own);
    const shown = shownSiteIcon(site, chosen?.url, saved.businessLogoUrl);
    // What stands in once the site has none of its own.
    const without = saved.businessLogoUrl ? "logo" : "plain";
    const shapeNote = chosen ? siteIconShapeNote(chosen) : null;

    return (
        <SettingsSheetFrame
            editId={settingsEditId("icon")}
            title="Site icon"
            description="The small picture beside your site's name in a browser tab, in bookmarks and on a phone's home screen."
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                const was = saved.own?.mediaId ?? null;
                const now = chosen?.mediaId ?? null;
                // Nothing chosen or removed: nothing to save.
                if (Boolean(chosen) === Boolean(saved.own) && now === was) {
                    onClose();
                } else onSave(now);
            }}
        >
            <p className="text-sm font-medium" data-icon-source={shown.source}>
                {SITE_ICON_LINE[shown.source]}
            </p>

            <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
                <div className="grid content-start gap-2">
                    <p className="text-xs text-muted-foreground">
                        In a browser tab
                    </p>
                    {/* A tab, as a browser draws one: the icon at 16px. */}
                    <div
                        data-icon-preview="tab"
                        className="flex min-w-0 items-center gap-2 rounded-t-md border border-b-0 border-border bg-muted px-3 py-2"
                    >
                        <SiteIconImage src={shown.src} className="size-4" />
                        <span className="min-w-0 truncate text-xs">
                            {site.name}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <SiteIconImage src={shown.src} className="size-8" />
                        <span className="text-xs text-muted-foreground">
                            Larger, as in bookmarks
                        </span>
                    </div>
                </div>
                <div className="grid content-start gap-2">
                    <p className="text-xs text-muted-foreground">
                        On a phone&apos;s home screen
                    </p>
                    <div
                        data-icon-preview="phone"
                        className="grid w-20 justify-items-center gap-1"
                    >
                        <SiteIconImage
                            src={shown.src}
                            className="size-14 rounded-xl"
                        />
                        <span className="w-full truncate text-center text-xs">
                            {site.name}
                        </span>
                    </div>
                </div>
            </div>

            <MediaPicker
                label={chosen ? "Choose another image" : "Choose an image"}
                check={siteIconFileProblem}
                onPick={(image) => {
                    // An icon is kept as a library image, never an address.
                    if (!image.mediaId) return;
                    setChosen({
                        url: image.src,
                        mediaId: image.mediaId,
                        width: image.width,
                        height: image.height,
                    });
                }}
            />
            <p className={NOTE}>{SITE_ICON_GUIDE}</p>
            {shapeNote ? (
                <p className={NOTE} role="status" data-icon-shape-note>
                    {shapeNote}
                </p>
            ) : null}

            {chosen ? (
                <div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setChosen(null)}
                    >
                        {SITE_ICON_REMOVE[without]}
                    </Button>
                </div>
            ) : (
                <p className={NOTE}>{WITHOUT[without]}</p>
            )}
        </SettingsSheetFrame>
    );
}
