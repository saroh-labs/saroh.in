import { showError } from "@saroh/ui/toast";
import { useEffect, useRef, useState } from "react";

import { useLeaveGuard } from "@/components/sites/use-leave-guard";
import { updateSiteFooter, updateSiteSettings } from "@/lib/sites/actions";
import { footerFromLine, footerLineField } from "@/lib/sites/footer-line";
import type { SiteFooter, SitesResult } from "@/lib/sites/service";

/** Which site setting a save changed, in the API's pending-change words. */
export type ChromeKind = "name" | "footer";

const AUTOSAVE_MS = 700;

/**
 * How long a value that failed waits before it is tried again, attempt by
 * attempt; the last repeats. A failed name or footer is unsaved work, and
 * Publish waits for it, so it may not simply stop (review G-4) — but a 400
 * must not go out every pause either.
 */
export const CHROME_RETRY_MS = [5_000, 15_000, 30_000, 60_000] as const;

/**
 * One text setting saved on its own clock, the way the look is
 * (`use-editor-style.ts`): after a pause, one save at a time. A value that
 * failed says so ("Not saved"), with one toast, and is tried again on its
 * own after a growing pause ({@link CHROME_RETRY_MS}) until it saves or the
 * merchant changes it.
 */
function useAutosavedText({
    value,
    initial,
    enabled,
    save,
    onSaved,
    unreachable,
}: {
    value: string;
    initial: string;
    /** False while the value may not be saved: not allowed, or not valid. */
    enabled: boolean;
    save: (value: string) => Promise<SitesResult<unknown>>;
    onSaved: () => void;
    unreachable: string;
}) {
    const [saved, setSaved] = useState(initial);
    const [saving, setSaving] = useState(false);
    // The value that last failed, and how many times it has in a row.
    const [failure, setFailure] = useState<{
        value: string;
        attempts: number;
    } | null>(null);
    // The newest save and callback, without restarting the pause on a render.
    const saveRef = useRef(save);
    const onSavedRef = useRef(onSaved);
    useEffect(() => {
        saveRef.current = save;
        onSavedRef.current = onSaved;
    });

    useEffect(() => {
        if (!enabled || saving || value === saved) return;
        const retrying = failure?.value === value ? failure.attempts : 0;
        const wait =
            retrying === 0
                ? AUTOSAVE_MS
                : CHROME_RETRY_MS[
                      Math.min(retrying, CHROME_RETRY_MS.length) - 1
                  ];
        const id = setTimeout(() => {
            setSaving(true);
            const failed = (message: string) => {
                // One toast per value: a retry that fails again says
                // nothing new, and the bar still reads "Not saved".
                if (retrying === 0) showError(message);
                setFailure({ value, attempts: retrying + 1 });
            };
            saveRef
                .current(value)
                .then((res) => {
                    if (res.ok) {
                        setFailure(null);
                        setSaved(value);
                        onSavedRef.current();
                    } else {
                        failed(res.error);
                    }
                })
                .catch(() => failed(unreachable))
                .finally(() => setSaving(false));
        }, wait);
        return () => clearTimeout(id);
    }, [value, saved, saving, enabled, unreachable, failure]);

    return {
        saved,
        saving,
        dirty: saving || (enabled && value !== saved),
        /** The value on screen failed to save and waits to be tried again. */
        failed: enabled && !saving && failure?.value === value,
    };
}

/**
 * The header's name and the footer's line, edited in the inspector (round 2,
 * G6, R7).
 *
 * They are the site's own settings, not the page's blocks, so they save
 * through the site's settings (`site:update`) on their own clock, like the
 * look, and the canvas draws the draft at once. What the canvas draws is
 * what G17's header and footer will draw once published: the name, and the
 * line followed by " · Runs on Saroh".
 *
 * Without `site:update` nothing here saves: the inspector shows both
 * read-only and says who can change them, and the API would refuse anyway.
 */
export function useSiteChrome({
    siteId,
    siteName,
    footerPreview,
    canUpdate,
    onSaved,
}: {
    siteId: string;
    siteName: string;
    /** The footer as the API sanitized it (#336). */
    footerPreview: SiteFooter | null;
    /** Whether this person holds `site:update`. */
    canUpdate: boolean;
    /** A saved name or footer is a change publishing would make. */
    onSaved: (kind: ChromeKind) => void;
}) {
    const [name, setName] = useState(siteName);
    const trimmedName = name.trim();
    const nameError = trimmedName === "" ? "Give your site a name." : null;
    const nameSave = useAutosavedText({
        value: trimmedName,
        initial: siteName.trim(),
        enabled: canUpdate && nameError === null,
        save: (value) => updateSiteSettings(siteId, { name: value }),
        onSaved: () => onSaved("name"),
        unreachable:
            "Could not reach Saroh. The name is still here, and saving will try again shortly.",
    });
    // Read once: a footer richer than one line is Website settings' to edit.
    const [field] = useState(() => footerLineField(footerPreview));
    const format = footerPreview?.format ?? "html";
    const [footerText, setFooterText] = useState(
        field.kind === "line" ? field.text : "",
    );
    const footerSave = useAutosavedText({
        value: footerText.trim(),
        initial: field.kind === "line" ? field.text : "",
        enabled: canUpdate && field.kind === "line",
        save: (value) =>
            updateSiteFooter(siteId, footerFromLine(value, format)),
        onSaved: () => onSaved("footer"),
        unreachable:
            "Could not reach Saroh. The footer is still here, and saving will try again shortly.",
    });

    const saving = nameSave.saving || footerSave.saving;
    const dirty = nameSave.dirty || footerSave.dirty;
    // A name or footer still going out is work a closed tab would lose.
    useLeaveGuard(dirty);

    return {
        canUpdate,
        /** The name the header, the bar and the publish message show. */
        // Blank is never saved, so while the box is empty the canvas and the
        // bar keep the name that is saved.
        displayName: nameError === null ? trimmedName : nameSave.saved,
        name,
        setName,
        nameError,
        footerRich: field.kind === "rich",
        footerText,
        setFooterText,
        /*
         * The footer the canvas draws. A line is escaped as it is built
         * (`footerFromLine`), so it is safe to draw as markup; a richer
         * footer is the API's sanitized copy, untouched here.
         */
        footer:
            field.kind === "line"
                ? footerFromLine(footerText, format)
                : footerPreview,
        chromeSaving: saving,
        chromeDirty: dirty,
        /** A name or footer that did not save: the bar says "Not saved". */
        chromeFailed: nameSave.failed || footerSave.failed,
    };
}

export type SiteChrome = ReturnType<typeof useSiteChrome>;
