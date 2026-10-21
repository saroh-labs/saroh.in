"use server";

import { revalidatePath } from "next/cache";

import { readOverMrpIfAdded } from "@/lib/gst-rates/service";
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
 * rename must not leave a stale name in the header. A change of what is
 * being set up (DEC-070) changes words on every screen — the settings tab,
 * Home's first run — so it revalidates the whole layout.
 */
export async function saveOrganizationSettings(
    input: OrganizationSettingsInput,
): Promise<SettingsResult<OrganizationSettings>> {
    const result = await updateOrganizationSettings(input);
    if (result.ok) {
        revalidatePath("/settings/organization");
        // Website settings shows what the site says of how to reach the
        // business (DEC-128): the phone, the email, the social links.
        if (
            input.socialLinks !== undefined ||
            input.siteShowsRegisteredAddress !== undefined ||
            input.registeredAddressMapUrl !== undefined ||
            input.profile?.phone !== undefined ||
            input.profile?.contactEmail !== undefined ||
            input.registeredAddress !== undefined
        ) {
            revalidatePath("/sites", "layout");
        }
        if (input.kind !== undefined) revalidatePath("/", "layout");
        else revalidatePath("/");
    }
    return result;
}

/**
 * The same save, made from the invoice editor (review #15, 20 Oct 2026):
 * "Make this my default", How to pay us and the business-details step
 * before Issue. It revalidates nothing. Any revalidation makes the router
 * read the page it is on again, and once a new invoice has its own address
 * (`/<id>/edit`) that is another page than the one drawn (`/new`): the
 * editor was thrown away and drawn again, closing the Style sheet and
 * losing what was typed in the last 800 ms. The editor takes the answer
 * itself (`onSettings`), and a screen opened afterwards reads the settings
 * from the API (no fetch is cached, `lib/api/http.ts`), as
 * `updateInvoice` does.
 */
export async function saveOrganizationSettingsInPlace(
    input: OrganizationSettingsInput,
): Promise<SettingsResult<OrganizationSettings>> {
    return updateOrganizationSettings(input);
}

/**
 * What switching the business to "GST is added to my prices" would do to
 * its products' MRPs (12 Oct 2026, `lib/gst-rates/over-mrp.ts`): read by
 * that sheet when the choice is picked, before anything is saved. Null
 * when it couldn't be told; the save is checked by the API either way.
 */
export async function loadOverMrpIfAdded() {
    return readOverMrpIfAdded();
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

/** The logo, set from the invoice editor: nothing revalidated (review #15). */
export async function saveBusinessLogoInPlace(
    mediaId: string | null,
): Promise<SettingsResult<OrganizationSettings>> {
    return updateBusinessLogo(mediaId);
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
