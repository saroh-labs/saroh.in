import { showError } from "@saroh/ui/toast";
import { useEffect, useRef, useState } from "react";

import { updateSiteStyle } from "@/lib/sites/actions";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

/**
 * The site's look and its autosave. Moved out of `site-editor.tsx` unchanged
 * (#260); a sibling of the draft rather than part of it because the two are
 * different documents saved on different clocks.
 */
export function useEditorStyle({
    siteId,
    initialStyle,
    styleOptions,
    onSaved,
}: {
    siteId: string;
    initialStyle: SiteStyle;
    styleOptions: SiteStyleOptions;
    /** A saved style is a change publishing would make. Must be stable. */
    onSaved: () => void;
}) {
    const [style, setStyle] = useState<SiteStyle>(initialStyle);
    const [styleSaving, setStyleSaving] = useState(false);
    const [savedStyleJson, setSavedStyleJson] = useState(() =>
        JSON.stringify(initialStyle),
    );

    /*
     * A style change that is unsaved or still saving counts as unpublished
     * work too (#282). Publish only waited on the sections, so publishing inside
     * the style debounce snapshotted the previous look.
     */
    const styleDirty = styleSaving || JSON.stringify(style) !== savedStyleJson;

    /*
     * Style autosave.
     *
     * Separate from the sections autosave because they are different documents
     * on different endpoints: a colour change should not have to wait behind a
     * section save, and a failed section save must not silently discard a
     * palette. Debounced longer, because dragging a slider produces a value on
     * every pixel and none of the intermediate ones is worth a request.
     */
    /*
     * One style save at a time (#282). Without that, an older PUT could land
     * after a newer one and leave the older palette saved. The effect waits
     * while a save is in flight, then runs again for the newest style.
     *
     * A style that failed to save is not retried until it changes, or a 400
     * would retry every 700ms with a toast each time. A request that never
     * reached the API resolves to a failure too, instead of leaving
     * `styleSaving` stuck on and every later style unsaved.
     */
    const failedStyleJson = useRef<string | null>(null);
    useEffect(() => {
        const json = JSON.stringify(style);
        if (json === savedStyleJson || styleSaving) return;
        if (failedStyleJson.current === json) return;
        const id = setTimeout(() => {
            const payload = style;
            const payloadJson = JSON.stringify(payload);
            setStyleSaving(true);
            updateSiteStyle(siteId, payload)
                .then((res) => {
                    if (res.ok) {
                        failedStyleJson.current = null;
                        setSavedStyleJson(payloadJson);
                        // A saved style is a change publishing would make;
                        // without this the pill read "Published" (review).
                        onSaved();
                    } else {
                        failedStyleJson.current = payloadJson;
                        showError(res.error);
                    }
                })
                .catch(() => {
                    failedStyleJson.current = payloadJson;
                    showError(
                        "Could not reach Saroh. Your style is still here and will save with your next change.",
                    );
                })
                .finally(() => setStyleSaving(false));
        }, 700);
        return () => clearTimeout(id);
    }, [style, savedStyleJson, siteId, styleSaving, onSaved]);

    function resetStyle() {
        // Back to the business's own defaults — which is what the site looked
        // like before anyone touched the panel, not a Saroh default.
        const defaults: SiteStyle = {
            colours: Object.fromEntries(
                styleOptions.rows.map((r) => [r.key, r.swatches[0]?.key ?? ""]),
            ),
            scalars: Object.fromEntries(
                styleOptions.scalars.map((sc) => [sc.key, sc.default]),
            ),
        };
        setStyle(defaults);
    }

    return { style, setStyle, styleSaving, styleDirty, resetStyle };
}

export type EditorStyle = ReturnType<typeof useEditorStyle>;
