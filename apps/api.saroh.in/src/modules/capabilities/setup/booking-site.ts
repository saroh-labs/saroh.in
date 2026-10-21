/**
 * A booking page on the business's address without building a website
 * (DEC-175, #1158).
 *
 * Bookings makes the booking page as selling online makes the shop
 * (DEC-069): when a business that has no website turns Bookings on, or adds
 * a service customers can book online, Saroh makes the starter site
 * (DEC-141) on its address, Website switched on with it, through the same
 * Website setup the Turn on sheet sends. The starter follows the modules,
 * so it comes with its Book page, Contact and a plain Home. Nothing is
 * published: customers can't open it until someone who may publish the
 * site says so (`sites/booking-page.service.ts`).
 *
 * There is one site, never two: a business that has a website, or has
 * ever had one, gets nothing new here. Turning Website on later, or
 * editing it, is the same site (`prepareWebsite` reuses it).
 *
 * `ModuleSetupService.makeBookingSite` is the way in; it hands this file
 * Website's own switch and setup, so the site is made exactly as turning
 * Website on makes it.
 */
import type { Logger } from "@nestjs/common";
import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import { STARTER_TEMPLATE_ID } from "@saroh/templates";

import type { OrganizationContext } from "../../../common/types/organization-context";
import type { EntitlementService } from "../../billing/entitlement.service";
import { allows } from "../../organizations/organization-policy";
import { siteDefaults } from "../../sites/site-address";
import type { WebsiteSetupDto } from "./module-setup.dto";
import type { SetupCreated } from "./module-setup.writers";
import { prepareSetup } from "./module-setup.writers";

/** Why the booking page is being made. */
export type BookingSiteWhy =
    /** Bookings was just turned on. */
    | "turned-on"
    /** A service customers can book online was just added or opened. */
    | "service"
    /** Someone pressed "Make my booking page" in Bookings. */
    | "asked";

/**
 * Why no booking page is made now, or null when one should be:
 *
 * - `permission`: this person may not make a website (`site:create`) or
 *   switch Website on (`module:manage`). Owner and Admin may.
 * - `has-site`: the business has its website (one site, never two). A
 *   site deleted once counts too: Saroh never brings back a website that
 *   was removed, and its slug and address stay its own.
 * - `bookings-off`: Bookings isn't on.
 * - `no-service`: no service customers can book online (active, ticked
 *   for the booking page, not tied to a site).
 * - `unavailable`: Website isn't offered to this business (DEC-057).
 */
export type BookingSiteBlocker =
    "permission" | "has-site" | "bookings-off" | "no-service" | "unavailable";

/** Who may make it: the same two actions turning Website on asks. */
export function mayMakeBookingSite(ctx: OrganizationContext): boolean {
    return allows(ctx, "site:create") && allows(ctx, "module:manage");
}

/** See {@link BookingSiteBlocker}. Reads only. */
export async function bookingSiteBlocker(
    ctx: OrganizationContext,
    websiteRolledOut: (organizationId: string) => Promise<boolean>,
): Promise<BookingSiteBlocker | null> {
    if (!mayMakeBookingSite(ctx)) return "permission";
    const organizationId = ctx.organizationId;
    // One query at a time: under RLS each runs in the business's context.
    const site = await prisma.site.findFirst({
        where: { organizationId },
        select: { id: true },
    });
    if (site) return "has-site";
    const bookings = await prisma.organizationModule.findUnique({
        where: {
            organizationId_moduleKey: {
                organizationId,
                moduleKey: "APPOINTMENTS",
            },
        },
        select: { status: true },
    });
    if (bookings?.status !== "ENABLED") return "bookings-off";
    const service = await prisma.service.findFirst({
        where: bookableOnline(organizationId),
        select: { id: true },
    });
    if (!service) return "no-service";
    if (!(await websiteRolledOut(organizationId))) return "unavailable";
    return null;
}

/**
 * A service customers can book online: the booking page lists it. The
 * starter's Book page asks the same (`buildTemplateContext`'s services).
 */
export function bookableOnline(
    organizationId: string,
): Prisma.ServiceWhereInput {
    return {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        showOnBookingPage: true,
        siteId: null,
    };
}

/**
 * The address a refusal offers instead (`claimSiteAddress`'s 409:
 * `details.suggestion`), or null.
 */
export function suggestedAddress(error: unknown): string | null {
    if (
        !error ||
        typeof error !== "object" ||
        !("getResponse" in error) ||
        typeof error.getResponse !== "function"
    ) {
        return null;
    }
    const body: unknown = (error.getResponse as () => unknown)();
    if (!body || typeof body !== "object" || !("details" in body)) return null;
    const details = body.details;
    if (!details || typeof details !== "object") return null;
    const suggestion = (details as { suggestion?: unknown }).suggestion;
    return typeof suggestion === "string" && suggestion !== ""
        ? suggestion
        : null;
}

/** What making the booking page did. */
export type BookingSiteOutcome =
    | { made: true; siteId: string; address: string }
    | { made: false; blocker: BookingSiteBlocker | "refused" };

/** What `ModuleSetupService` lends to make it. */
export interface BookingSiteDeps {
    websiteRolledOut: (organizationId: string) => Promise<boolean>;
    websiteOn: () => Promise<boolean>;
    /** Website switched on with this setup: the switch and the site together. */
    enableWebsite: (
        setup: WebsiteSetupDto,
    ) => Promise<{ created: SetupCreated }>;
    entitlements: Pick<EntitlementService, "check" | "getEntitlements">;
    logger: Pick<Logger, "warn">;
}

/**
 * Make the booking page: the starter site on the business's address, not
 * published. Made by itself (`turned-on`, `service`) it never refuses:
 * whatever stops it (no room on the plan, an address taken since) is logged
 * and the caller carries on, as Bookings works without the page. Asked for
 * (`asked`), the refusal is thrown for the caller to say.
 */
export async function makeBookingSite(
    ctx: OrganizationContext,
    why: BookingSiteWhy,
    deps: BookingSiteDeps,
): Promise<BookingSiteOutcome> {
    try {
        const blocker = await bookingSiteBlocker(ctx, deps.websiteRolledOut);
        if (blocker) return { made: false, blocker };
        const { siteName, address } = await siteDefaults(
            prisma,
            ctx.organizationId,
        );
        if (!address) return { made: false, blocker: "refused" };
        try {
            return await writeBookingSite(ctx, siteName, address, deps);
        } catch (error) {
            // The address went to someone else since it was offered: once
            // more, at the free one the refusal suggests.
            const instead =
                error instanceof ConflictException
                    ? suggestedAddress(error)
                    : null;
            if (!instead) throw error;
            return await writeBookingSite(ctx, siteName, instead, deps);
        }
    } catch (error) {
        if (why === "asked") throw error;
        // WARN: a business with Bookings and no booking page made. A few are
        // expected (a plan with no room for a website); a steady stream
        // means the starter or the address rules broke it.
        deps.logger.warn(
            `Booking page not made for organization ${ctx.organizationId} (${why}): ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        return { made: false, blocker: "refused" };
    }
}

/**
 * The starter site at `address`: Website switched on with it when it is
 * off (the switch and the site commit together), else the site alone, on
 * Website's own setup write.
 */
async function writeBookingSite(
    ctx: OrganizationContext,
    siteName: string,
    address: string,
    deps: BookingSiteDeps,
): Promise<BookingSiteOutcome> {
    const setup: WebsiteSetupDto = {
        siteName,
        address,
        // The starter, whatever the kind: its Book page, Contact and a
        // plain Home follow the modules (DEC-141).
        templateId: STARTER_TEMPLATE_ID,
    };
    let siteId: string | undefined;
    if (await deps.websiteOn()) {
        const write = await prepareSetup(
            ctx,
            "WEBSITE",
            setup,
            deps.entitlements,
        );
        siteId = (await prisma.$transaction((tx) => write(tx))).siteId;
    } else {
        siteId = (await deps.enableWebsite(setup)).created.siteId;
    }
    return siteId
        ? { made: true, siteId, address }
        : { made: false, blocker: "refused" };
}

/**
 * The booking page turning Bookings on would make, for the Turn on sheet
 * (`setup-defaults`' `alsoBookingPage`): its address, when this person may
 * make it, the business has never had a website and Website is offered.
 * Bookings being off and its first service missing don't count: the sheet
 * turns one on and makes the other.
 */
export async function bookingPageToCome(
    ctx: OrganizationContext,
    websiteRolledOut: (organizationId: string) => Promise<boolean>,
): Promise<{ address: string } | null> {
    const organizationId = ctx.organizationId;
    if (!mayMakeBookingSite(ctx)) return null;
    const site = await prisma.site.findFirst({
        where: { organizationId },
        select: { id: true },
    });
    if (site) return null;
    if (!(await websiteRolledOut(organizationId))) return null;
    const { address } = await siteDefaults(prisma, organizationId);
    return address ? { address } : null;
}
