"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { SELLS_FROM_ANCHOR } from "@/lib/sites/sells-from";
import type { SettingsSheet } from "@/lib/sites/settings-edit";
import {
    SETTINGS_EDIT_PARAM,
    settingsSheetFromParam,
} from "@/lib/sites/settings-edit";

import type { SheetControl } from "./settings-sheet";

/**
 * The settings rows' sheets and their one save loop (#188; read first
 * since 10 Oct): one sheet open at a time, each save PATCHes only its own
 * field, and a refusal leaves the sheet open so nothing typed is lost.
 *
 * `opened` counts the openings, so each one is a fresh draft; the sheet is
 * kept while it slides shut. A link opens one with `?edit=`; closing it
 * takes the query out of the address, so a reload starts from the rows.
 */
export function useSettingsSave(
    /** The sheet a request really opens, or none (no shop to choose for). */
    resolve: (which: SettingsSheet) => SettingsSheet | null = (which) => which,
) {
    const router = useRouter();
    const asked = settingsSheetFromParam(
        useSearchParams().get(SETTINGS_EDIT_PARAM),
    );
    const [editing, setEditing] = useState<{
        which: SettingsSheet;
        open: boolean;
        opened: number;
    } | null>(() => {
        const which = asked ? resolve(asked) : null;
        return which ? { which, open: true, opened: 1 } : null;
    });
    const [pending, startTransition] = useTransition();

    function open(asking: SettingsSheet) {
        const which = resolve(asking);
        if (!which) return;
        setEditing((e) => ({
            which,
            open: true,
            opened: (e?.opened ?? 0) + 1,
        }));
    }

    function close() {
        setEditing((e) => (e ? { ...e, open: false } : e));
        const url = new URL(window.location.href);
        const linked =
            url.searchParams.has(SETTINGS_EDIT_PARAM) ||
            url.hash === `#${SELLS_FROM_ANCHOR}`;
        if (!linked) return;
        url.searchParams.delete(SETTINGS_EDIT_PARAM);
        url.hash = "";
        window.history.replaceState(null, "", url);
    }

    function run(
        call: () => Promise<{ ok: true } | { ok: false; error: string }>,
        said: string,
        /** The row shows the new value at once, before the page reads again. */
        onSaved?: () => void,
    ) {
        startTransition(async () => {
            const res = await call();
            if (!res.ok) {
                showError(res.error);
                return;
            }
            onSaved?.();
            close();
            // Refresh so the server props (and the publish bar's count)
            // agree with what the row now says.
            router.refresh();
            showSuccess(said);
        });
    }

    /** One row's sheet: whether it is the open one, and how to open it. */
    function control(which: SettingsSheet): SheetControl {
        const mine = editing?.which === which ? editing : null;
        return {
            open: mine?.open ?? false,
            opened: mine?.opened ?? 0,
            show: () => open(which),
            close,
        };
    }

    return { editing, open, close, pending, run, control };
}

export type SettingsSave = ReturnType<typeof useSettingsSave>;
