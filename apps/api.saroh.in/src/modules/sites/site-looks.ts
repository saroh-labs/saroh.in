import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { LookId } from "@saroh/templates";
import { defaultLookForTemplate, parseLook } from "@saroh/templates";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { SiteStyle } from "./site-style";

/**
 * Looks on a site (DEC-172, plan U2): Folio, Quiet or Live, behind the
 * `SITE_LOOKS` rollout flag (KD12). The flag gates CHOOSING a look, never
 * having one:
 *
 * - a style save that sets a look, or changes it to another, needs the
 *   flag on for the business ({@link assertLookAllowed});
 * - keeping the look the draft already has, and clearing it back to
 *   Classic, are always accepted, so turning the flag off never locks an
 *   owner out of Website › Style;
 * - a new site starts in its template's look only while the flag is on
 *   ({@link newSiteLook}).
 *
 * The renderer needs no flag: it draws what the publication says, and a
 * publication only carries a look this API accepted.
 *
 * Readers of `SITE_LOOKS`: this module's three functions (style saves,
 * site creation, the editor's `looksAvailable`).
 */

// Stateless (it reads the flag rows on every call), like `sells-from.ts`'s.
const flags = new FeatureFlagService();

/** The refusal's code, for a client to tell it from a bad value. */
export const LOOK_NOT_AVAILABLE = "look-not-available";

/** Whether this business may choose a look (`SITE_LOOKS`, fails closed). */
export function looksRolloutOn(organizationId: string): Promise<boolean> {
    return flags.isEnabled(FlagKey.SITE_LOOKS, organizationId);
}

/** The look a stored style has, or undefined (Classic, or unreadable). */
export function storedLook(stored: unknown): LookId | undefined {
    if (stored === null || typeof stored !== "object") return undefined;
    const parsed = parseLook((stored as { look?: unknown }).look);
    return parsed.ok ? parsed.look : undefined;
}

/**
 * Refuse setting or changing a look while `SITE_LOOKS` is off for the
 * business: a 400 with `details.code` {@link LOOK_NOT_AVAILABLE}. A save
 * without a look, or with the one the draft already has, costs no read
 * of the flag.
 */
export async function assertLookAllowed(
    organizationId: string,
    siteId: string,
    next: Pick<SiteStyle, "look">,
): Promise<void> {
    if (!next.look) return;
    const site = await prisma.site.findFirst({
        where: { id: siteId, organizationId, deletedAt: null },
        select: { style: true },
    });
    if (storedLook(site?.style) === next.look) return;
    if (await looksRolloutOn(organizationId)) return;
    throw new BadRequestException({
        message: "Looks aren't available for this business yet",
        details: { field: "look", code: LOOK_NOT_AVAILABLE },
    });
}

/**
 * The look a new site made from `templateId` starts in: its industry
 * default while `SITE_LOOKS` is on for the business, else none (Classic).
 */
export async function newSiteLook(
    organizationId: string,
    templateId: string,
): Promise<LookId | undefined> {
    return (await looksRolloutOn(organizationId))
        ? defaultLookForTemplate(templateId)
        : undefined;
}
