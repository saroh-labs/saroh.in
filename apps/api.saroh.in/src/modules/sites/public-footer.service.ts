import {
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { Prisma, prisma, runInOrgContext } from "@saroh/database";

import type { BusinessAccess } from "../billing/catalogue-access.service";
import {
    CatalogueAccessService,
    FREE_PLAN_ID,
} from "../billing/catalogue-access.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { stateName } from "../invoices/gst-states";
import { formatSellerAddress } from "../invoices/order-invoice";
import { publicPhone } from "../organizations/business-phone";
import { newRefCode } from "../waitlist/waitlist-keys";

/**
 * What a site's footer shows that the snapshot doesn't carry, read live
 * (DEC-101, DEC-102): the business's contact email, and the Saroh credit.
 *
 * - `email`: the business's contact email from Settings › Business, when it
 *   has added one (DEC-101). Settings says the site shows it.
 * - `credit`: "Made with Saroh" with the business's referral code (#812),
 *   on Free only. Paid plans show no Saroh credit (DEC-102).
 *
 * - `seller`: who a customer is buying from, in the business's own details
 *   (DEC-121): its legal name (null when it has set none; the site then says
 *   its own name), its registered address on one line as its invoices print
 *   it, and its public phone (DEC-053). Never the GSTIN, the business type
 *   or anything else Settings › Business holds.
 *
 * The place stays the Visit us read's (`/visit`, UX-038).
 */
export interface PublicFooter {
    email: string | null;
    credit: { referralCode: string } | null;
    seller: {
        legalName: string | null;
        address: string | null;
        phone: string | null;
    };
}

/** Page views per visitor per minute, as the Visit us read allows. */
const READS_PER_WINDOW = 120;
const READ_WINDOW_MS = 60_000;

/** Tries at a fresh referral code before giving up on the credit. */
const CODE_TRIES = 3;

/**
 * Whether the business is on Free now: the catalogue's Free plan after any
 * plan override, or the free floor of a business the catalogue doesn't reach
 * yet. Anything else (a paid plan, a legacy paid row, a catalogue that can't
 * be read) is not Free, so a paying business never wears the credit.
 */
export function onFree(access: BusinessAccess): boolean {
    if (access.source === "catalogue") return access.planId === FREE_PLAN_ID;
    return access.reason === "no-plan";
}

/** A stored email, or null when it says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/**
 * Serves a site's footer facts. The Site is resolved first and its business
 * derived from it; nothing the caller sends names a business. A deleted site
 * is a 404. It need not be published, as with Visit us.
 */
@Injectable()
export class PublicFooterService {
    constructor(
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
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
    ): Promise<PublicFooter> {
        if (!this.limiter.take(callerHash ?? `site:${siteId}`)) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: {
                organizationId: true,
                organization: { select: { referralCode: true } },
            },
        });
        if (!site) throw new NotFoundException("Nothing to show here");
        const { organizationId } = site;

        const [profile, access] = await Promise.all([
            runInOrgContext(organizationId, () =>
                prisma.businessProfile.findUnique({
                    where: { organizationId },
                    select: {
                        contactEmail: true,
                        legalName: true,
                        addressLine1: true,
                        addressLine2: true,
                        city: true,
                        postalCode: true,
                        gstState: true,
                        phone: true,
                    },
                }),
            ),
            this.access.resolve(organizationId),
        ]);
        const free = onFree(access);
        const referralCode = free
            ? (site.organization.referralCode ??
              (await this.giveCode(organizationId)))
            : null;
        return {
            email: said(profile?.contactEmail),
            credit: referralCode ? { referralCode } : null,
            seller: {
                legalName: said(profile?.legalName),
                address: profile
                    ? formatSellerAddress({
                          ...profile,
                          stateName: stateName(profile.gstState),
                      })
                    : null,
                phone: publicPhone(profile?.phone),
            },
        };
    }

    /**
     * The business's referral code, given the first time its credit is
     * drawn. Written only where none is set, so two first views agree on
     * one. A clash with another business's code tries a fresh one; after
     * `CODE_TRIES` the credit is left out for this view rather than failing
     * the page.
     */
    private async giveCode(organizationId: string): Promise<string | null> {
        for (let i = 0; i < CODE_TRIES; i += 1) {
            try {
                await prisma.organization.updateMany({
                    where: { id: organizationId, referralCode: null },
                    data: { referralCode: newRefCode() },
                });
                break;
            } catch (error) {
                const clash =
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === "P2002";
                if (!clash) throw error;
            }
        }
        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { referralCode: true },
        });
        return org?.referralCode ?? null;
    }
}
