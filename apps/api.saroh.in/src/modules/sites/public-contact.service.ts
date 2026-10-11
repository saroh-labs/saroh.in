import {
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { PublicContact } from "../organizations/business-contact";
import { businessPublicContactOf } from "../organizations/business-contact";

/** Page views per visitor per minute, as the Visit us read allows. */
const READS_PER_WINDOW = 120;
const READ_WINDOW_MS = 60_000;

/**
 * Serves how to reach a site's business (DEC-128): its public phone,
 * contact email, where customers come and its social links, for the site's
 * footer, its structured data and any page that says "get in touch".
 *
 * Read live, like the phone always was (`/visit`, DEC-053): a change in
 * Settings shows without a publish. The Site is resolved first and its
 * business derived from it; nothing the caller sends names a business, and
 * the read runs in that business's RLS context, so another business's
 * details can never be served. A deleted site is a 404. It need not be
 * published, as with Visit us: a preview shows its footer too.
 */
@Injectable()
export class PublicContactService {
    constructor(
        // Not a DI provider — a per-instance default that tests can replace.
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
    ) {}

    async read(
        siteId: string,
        callerHash: string | undefined,
    ): Promise<PublicContact> {
        if (!this.limiter.take(callerHash ?? `site:${siteId}`)) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: { organizationId: true },
        });
        if (!site) throw new NotFoundException("Nothing to show here");
        const { organizationId } = site;
        return runInOrgContext(organizationId, () =>
            businessPublicContactOf(organizationId),
        );
    }
}
