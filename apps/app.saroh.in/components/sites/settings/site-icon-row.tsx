"use client";

import { useState } from "react";

import { Row } from "@/components/sites/settings-rows";
import { saveSiteIcon } from "@/lib/sites/actions";
import type { SiteDetail, SiteIconSaved } from "@/lib/sites/service";
import {
    shownSiteIcon,
    SITE_ICON_ANCHOR,
    siteIconOf,
} from "@/lib/sites/site-icon";

import { EditAction } from "./edit-actions";
import { SiteIconSheet } from "./site-icon-sheet";
import { SiteIconSummary } from "./site-icon-summary";
import type { SettingsSave } from "./use-settings-save";

/**
 * The "Site icon" row of Search and sharing (DEC-124), read first: the icon
 * the site shows, small, and one line saying which it is (its own, the
 * business logo, or a plain tile with its initial). Add or Change opens the
 * row's sheet, where the image is uploaded, seen at its sizes and removed.
 *
 * Part of the draft, like the share image: saved now, live at the next
 * publish. A save shows in the row at once, before the page reads again.
 */
export function SiteIconRow({
    site,
    state,
}: {
    site: SiteDetail;
    state: SettingsSave;
}) {
    const [saved, setSaved] = useState<SiteIconSaved>(siteIconOf(site));
    const { editing, run, pending, close } = state;
    const shown = shownSiteIcon(site, saved.own?.url, saved.businessLogoUrl);

    function save(mediaId: string | null) {
        let next: SiteIconSaved | null = null;
        run(
            async () => {
                const res = await saveSiteIcon(site.id, mediaId);
                if (res.ok) next = res.data.icon;
                return res;
            },
            mediaId
                ? "Site icon saved. Publish to make it public."
                : "Site icon removed. Publish to make it public.",
            () => {
                if (next) setSaved(next);
            },
        );
    }

    return (
        <>
            <Row
                id={SITE_ICON_ANCHOR}
                label="Site icon"
                draft
                action={
                    <EditAction
                        row="icon"
                        state={state}
                        label={saved.own ? "Change" : "Add"}
                        name={saved.own ? "Change site icon" : "Add site icon"}
                    />
                }
            >
                <SiteIconSummary shown={shown} />
            </Row>

            {/* The open sheet, a fresh draft each time it opens. */}
            {editing?.which === "icon" ? (
                <SiteIconSheet
                    key={editing.opened}
                    site={site}
                    saved={saved}
                    open={editing.open}
                    pending={pending}
                    onClose={close}
                    onSave={save}
                />
            ) : null}
        </>
    );
}
