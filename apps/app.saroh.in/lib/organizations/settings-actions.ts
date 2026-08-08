"use server";

import { revalidatePath } from "next/cache";

import type {
    OrganizationSettings,
    OrganizationSettingsInput,
    SettingsResult,
} from "./settings-service";
import { updateOrganizationSettings } from "./settings-service";

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
