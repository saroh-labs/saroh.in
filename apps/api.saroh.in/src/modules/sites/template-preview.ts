import { prisma } from "@saroh/database";
import type { BusinessFacts, TemplateContext } from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import { businessTimezone } from "../bookings/staff-availability";
import { businessPublicPhoneOf } from "../organizations/business-phone";
import { authorize } from "../organizations/organization-policy";
import type { PublicVisit } from "./public-visit.service";
import { businessVisit } from "./public-visit.service";
import { buildTemplateContext } from "./site-template";
import { businessFacts } from "./starter-content";

/** A service as a site's services list draws it. */
export interface PreviewService {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceCents: number | null;
    currency: string | null;
}

/**
 * What a template's preview draws of the business itself (DEC-216): the
 * context a site made now would be instantiated with, the services its
 * lists would show, its place and hours, and the facts "Fill in my
 * details" puts in. Nothing written.
 */
export interface TemplatePreviewDetails {
    context: TemplateContext;
    services: PreviewService[];
    visit: Omit<PublicVisit, "closedDates">;
    facts: BusinessFacts;
}

/**
 * The business's own details for a template's preview, before a site
 * exists (Turn on Website, New site) or after (the editor's Template row).
 * `site:read`: what anyone who may see the website may see of it.
 */
export async function templatePreviewDetails(
    ctx: OrganizationContext,
): Promise<TemplatePreviewDetails> {
    authorize(ctx, "site:read");
    const organizationId = ctx.organizationId;
    const context = await buildTemplateContext(organizationId);
    const ids = context.serviceIds ?? [];
    const [rows, timezone, phone, facts] = await Promise.all([
        ids.length > 0
            ? prisma.service.findMany({
                  where: { organizationId, id: { in: ids } },
                  select: {
                      id: true,
                      name: true,
                      description: true,
                      durationMinutes: true,
                      priceCents: true,
                      currency: true,
                  },
              })
            : Promise.resolve([]),
        businessTimezone(prisma, organizationId),
        businessPublicPhoneOf(organizationId),
        businessFacts(prisma, organizationId, context.area),
    ]);
    // In the context's order: oldest first, as a Book page lists them.
    const services = ids.flatMap((id) => rows.filter((r) => r.id === id));
    const visit = await businessVisit(
        organizationId,
        context.organizationName,
        timezone,
        phone,
    );
    return { context, services, visit, facts };
}
