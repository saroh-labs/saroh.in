"use server";

import { revalidatePath } from "next/cache";

import type { OpeningHoursDay } from "@/lib/stores/storefronts";
import {
    listStorefrontHours,
    updateStorefront,
} from "@/lib/stores/storefronts";

import type {
    OrganizationSettings,
    OrganizationSettingsInput,
    SettingsResult,
} from "./settings-service";
import {
    getOrganizationSettings,
    readOrganizationSettings,
    updateBusinessLogo,
    updateOrganizationSettings,
} from "./settings-service";
import type { HoursUndoEntry, LogoUndo, SettingsUndo } from "./settings-undo";
import {
    hoursUndoRefusal,
    logoUndoRefusal,
    undoRefusal,
} from "./settings-undo";

/**
 * Save the active organization's identity. A thin Server Action over the API —
 * authorization (OWNER/ADMIN) and validation both live server-side in
 * api.saroh.in, so this never decides anything itself.
 *
 * Revalidates `/` too: the chrome renders the org name in the switcher, so a
 * rename must not leave a stale name in the header.
 */
export async function saveOrganizationSettings(
    input: OrganizationSettingsInput,
): Promise<SettingsResult<OrganizationSettings>> {
    const result = await updateOrganizationSettings(input);
    if (result.ok) {
        revalidatePath("/settings/organization");
        revalidatePath("/");
    }
    return result;
}

/**
 * What "Add your business details" starts from (DEC-068): the settings as
 * they are, or why they can't be read (a role without them is told so).
 */
export async function readBusinessDetails() {
    return readOrganizationSettings();
}

/**
 * Set the business logo to an uploaded library image, or take it off
 * (`null`). The API checks the role, the image's owner, type and size.
 */
export async function saveBusinessLogo(
    mediaId: string | null,
): Promise<SettingsResult<OrganizationSettings>> {
    const result = await updateBusinessLogo(mediaId);
    // Invoices print it at the top.
    if (result.ok) revalidatePath("/settings/organization");
    return result;
}

/*
 * Undo on a Settings save (F12). Each reads the settings as they are now and
 * refuses when what it would overwrite is no longer what the save left
 * (`settings-undo.ts`); otherwise it saves the previous values back through
 * the same write, which the API checks and audits as a change of its own.
 * A read that fails refuses too: an Undo never writes over what it cannot
 * see.
 */

const UNREAD = "Couldn't check what's saved now, so nothing was undone";

export async function undoOrganizationSettings(
    undo: SettingsUndo,
): Promise<SettingsResult<OrganizationSettings>> {
    const current = await getOrganizationSettings().catch(() => null);
    if (!current) return { ok: false, error: UNREAD };
    const refusal = undoRefusal(undo, current);
    if (refusal) return { ok: false, error: refusal };
    return saveOrganizationSettings(undo.input);
}

export async function undoBusinessLogo(
    undo: LogoUndo,
): Promise<SettingsResult<OrganizationSettings>> {
    const current = await getOrganizationSettings().catch(() => null);
    if (!current) return { ok: false, error: UNREAD };
    const refusal = logoUndoRefusal(undo, current);
    if (refusal) return { ok: false, error: refusal };
    return saveBusinessLogo(undo.mediaId);
}

/**
 * Every storefront's week back as it was, one write each as the save made
 * them. A write refused is said; the ones that went through stand.
 */
export async function undoStorefrontHours(
    entries: HoursUndoEntry[],
): Promise<SettingsResult<{ id: string; openingHours: OpeningHoursDay[] }[]>> {
    const read = await listStorefrontHours();
    if (read.state !== "ok") return { ok: false, error: UNREAD };
    const refusal = hoursUndoRefusal(entries, read.storefronts);
    if (refusal) return { ok: false, error: refusal };
    const results = await Promise.all(
        entries.map((entry) =>
            updateStorefront(entry.id, { openingHours: entry.before }),
        ),
    );
    revalidatePath("/", "layout");
    for (const result of results) {
        if (!result.ok) return { ok: false, error: result.error };
    }
    return {
        ok: true,
        data: entries.map((entry) => ({
            id: entry.id,
            openingHours: entry.before,
        })),
    };
}
