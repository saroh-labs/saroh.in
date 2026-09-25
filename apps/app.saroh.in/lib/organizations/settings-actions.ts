"use server";

import { revalidatePath } from "next/cache";

import type {
    OrganizationSettings,
    OrganizationSettingsInput,
    SettingsResult,
} from "./settings-service";
import {
    updateBusinessLogo,
    updateOrganizationSettings,
} from "./settings-service";

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
