import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { moduleRolledOut } from "../capabilities/module-registry";
import {
    bookingSiteBlocker,
    mayMakeBookingSite,
} from "../capabilities/setup/booking-site";
import { ModuleSetupService } from "../capabilities/setup/module-setup.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { allows, authorize } from "../organizations/organization-policy";
import { businessSite } from "../organizations/web-address.service";
import { modulePageState } from "./module-pages";
import { primaryHostOf } from "./primary-host";
import { SitesService } from "./sites.service";

/**
 * "Your booking page" in Bookings (DEC-175, #1158): the business's booking
 * page, `<address>.saroh.app/book` (or its verified domain), read and
 * published from Bookings without going through Website.
 *
 * It is the business's website (`businessSite`, the one the web-address
 * read shares), never a second one: a business that has a website just
 * sees its link. Publishing it is publishing that site, through
 * `SitesService.publishSite`, so Website › Publish's rules all hold
 * (`site:publish`, "Publishing needs approval", the owner's override, the
 * web address).
 */

/**
 * - `none`: no website yet.
 * - `draft`: a website with a Book page nobody can open yet: it has never
 *   been published, or isn't served anywhere.
 * - `live`: customers can open `/book`.
 */
export type BookingPageState = "none" | "draft" | "live";

export interface BookingPageView {
    state: BookingPageState;
    /** The website it is on; null with `none`. */
    site: { id: string; name: string; address: string | null } | null;
    /** Where it is served: the verified domain, else `<address>.saroh.app`. */
    host: string | null;
    /** `https://<host>/book`, once there is a host. */
    url: string | null;
    /**
     * The website has been published before (its booking page went with
     * it or not): Publish here would put every waiting change live too, so
     * the row sends that to Website instead.
     */
    published: boolean;
    /** `site:publish`: Publish booking page is this person's to press. */
    mayPublish: boolean;
    /**
     * With `none`: whether Make my booking page is offered, and why not.
     * `ready` is a yes. Null with a website.
     */
    make:
        | "ready"
        | "permission"
        | "no-service"
        | "unavailable"
        /** It had a website once, since removed: Website sets up another. */
        | "website"
        | null;
}

@Injectable()
export class BookingPageService {
    constructor(
        private readonly sites: SitesService,
        private readonly setup: ModuleSetupService,
        private readonly flags: FeatureFlagService,
    ) {}

    /** `GET …/booking-page`: anyone who may see the services. */
    async read(ctx: OrganizationContext): Promise<BookingPageView> {
        authorize(ctx, "service:read");
        const organizationId = ctx.organizationId;
        const site = await businessSite(prisma, organizationId);
        const mayPublish = allows(ctx, "site:publish");
        if (!site) {
            return {
                state: "none",
                site: null,
                host: null,
                url: null,
                published: false,
                mayPublish,
                make: await this.makeState(ctx),
            };
        }
        const host = await primaryHostOf({
            id: site.id,
            organizationId,
            subdomain: site.subdomain,
        });
        const published = site.currentPublicationId !== null;
        // `/book` serves once the site is live and Bookings is on and
        // offered (the web-address read's `links.book`, KTD-8).
        const bookOn =
            (await modulePageState("BOOK", organizationId)).state === "on";
        const named = await prisma.site.findUniqueOrThrow({
            where: { id: site.id },
            select: { name: true },
        });
        return {
            state: published && host !== null && bookOn ? "live" : "draft",
            site: { id: site.id, name: named.name, address: site.subdomain },
            host,
            url: host ? `https://${host}/book` : null,
            published,
            mayPublish,
            make: null,
        };
    }

    /**
     * `POST …/booking-page`: Make my booking page, for a business with
     * Bookings on and no website (one turned on before DEC-175, say).
     * Refused in words the row can show; answers the read.
     */
    async make(ctx: OrganizationContext): Promise<BookingPageView> {
        authorize(ctx, "site:create");
        authorize(ctx, "module:manage");
        const outcome = await this.setup.makeBookingSite(ctx, "asked");
        // Made already (pressed twice, or by the first service): the read.
        const there =
            !outcome.made &&
            outcome.blocker === "has-site" &&
            (await businessSite(prisma, ctx.organizationId)) !== null;
        if (!outcome.made && !there) {
            throw new ConflictException({
                message: MAKE_REFUSED[outcome.blocker],
                details: { reason: outcome.blocker },
            });
        }
        return this.read(ctx);
    }

    /**
     * `POST …/booking-page/publish`: publish the business's website, which
     * the booking page is on. `site:publish`; 404 with no website. Answers
     * the read, now live.
     */
    async publish(
        ctx: OrganizationContext,
        options: { override?: boolean } = {},
    ): Promise<BookingPageView> {
        authorize(ctx, "site:publish");
        const site = await businessSite(prisma, ctx.organizationId);
        if (!site) {
            throw new NotFoundException(
                "There's no booking page to publish yet.",
            );
        }
        await this.sites.publishSite(ctx, site.id, options);
        return this.read(ctx);
    }

    /** Whether Make my booking page is offered to this person, and why not. */
    private async makeState(
        ctx: OrganizationContext,
    ): Promise<BookingPageView["make"]> {
        if (!mayMakeBookingSite(ctx)) return "permission";
        const blocker = await bookingSiteBlocker(ctx, (orgId) =>
            moduleRolledOut(this.flags, "WEBSITE", orgId),
        );
        if (blocker === "has-site") return "website";
        // Bookings is on (the route's gate): only a race reads it off.
        if (blocker === "bookings-off") return "no-service";
        return blocker ?? "ready";
    }
}

/** What a refused Make my booking page says. */
const MAKE_REFUSED: Record<string, string> = {
    "has-site":
        "This business has had a website. Set it up again from Website to get your booking page.",
    permission: "Only an owner or admin can make the booking page.",
    "bookings-off": "Turn Bookings on to get a booking page.",
    "no-service":
        "Add a service customers can book online first. Your booking page lists it.",
    unavailable: "Booking pages aren't available for your business yet.",
    refused:
        "We couldn't make your booking page. Try again, or set up your website from Website.",
};
