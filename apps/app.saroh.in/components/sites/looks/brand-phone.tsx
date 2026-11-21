"use client";

import type { BrandPanelProps } from "./style-panel";
import { StylePanel } from "./style-panel";

/**
 * Brand on a phone (U24b, `WXBBrandPhone`), for the phone editor's bar
 * (U49): one group at a time behind a strip (Look · Colours · Fonts ·
 * Logo · Buttons and shapes), "Saved · goes live when you publish" and
 * Undo for the last change. Same props as the desk panel; pass `changes`
 * (`useEditorStyle().lookChanges`) for Undo, `siteIcon` for Logo.
 */
export function BrandPhone(
    props: Omit<BrandPanelProps, "phoneTabs" | "asideHosted">,
) {
    return <StylePanel {...props} phoneTabs />;
}
