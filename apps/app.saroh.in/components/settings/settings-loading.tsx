import type { SettingsWidth } from "@/components/settings/settings-panel";
import { SETTINGS_ROWS } from "@/components/settings/settings-panel";
import { PageLoading } from "@/components/shared/page-loading";

/**
 * A Settings section while it loads: inside the panel, with the side list
 * (the layout's) in place beside it, its real title and breadcrumb drawn,
 * and only the body grey. Every section uses this, so none replaces the
 * panel with a page of its own while it waits.
 *
 * `width` is the section's own (`SettingsPanel`'s), so the grey is as wide
 * as what lands.
 */
export function SettingsLoading({
    title,
    description,
    width = "rows",
    rows,
    label,
}: {
    /**
     * The section's name, as the side list says it. Left out where the
     * route can't know it yet: a bar stands in the title's place.
     */
    title?: string;
    description?: string;
    width?: SettingsWidth;
    rows?: number;
    label?: string;
}) {
    return (
        <PageLoading
            shape="settings"
            width="full"
            breadcrumb={title ? ["Settings", title] : ["Settings"]}
            title={title}
            description={description}
            rows={rows}
            label={label ?? (title ? `Loading ${title}` : "Loading")}
            bodyClassName={width === "rows" ? SETTINGS_ROWS : undefined}
        />
    );
}
