import {
    BadRequestException,
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { emailRoute } from "../communications/email-route";
import { noticeOn } from "../communications/notice-settings";
import { isReservedContactEmail } from "../contacts/contact-email";
import { authorize } from "../organizations/organization-policy";
import { siteCodeSecret } from "../site-accounts/site-secrets";
import type { WatchRefusal, WatchState } from "./stock-watch-rules";
import {
    signWatchToken,
    verifyWatchToken,
    WATCH_REFUSAL_WORDS,
    watchEmail,
    watchState,
} from "./stock-watch-rules";
import { readWatchable } from "./watchable";

type Tx = Prisma.TransactionClient;

/** Whether the site offers "Tell me" for a product or one option of it. */
export interface WatchOffer {
    offered: boolean;
    /** Why not, when it isn't; the site hides the button either way. */
    why: WatchRefusal | null;
}

/** A "Tell me" taken. */
export interface WatchTaken {
    state: "waiting";
    /**
     * The stop page's token (`stopWaitingPath`), for the site to offer
     * "Changed your mind? Stop waiting" right after. Only when this call
     * made the watch: asking again with an address already waiting gets
     * null, so typing someone's address never hands over a way to stop
     * theirs.
     */
    stopToken: string | null;
}

/** What the stop page shows. */
export interface WatchView {
    state: WatchState;
    business: string;
    /** "Linen shirt", or "Linen shirt (Blue / M)". */
    product: string;
}

/** The workspace's count (U24): who waits for a product, and per option. */
export interface WatchCount {
    productId: string;
    waiting: number;
    /** Per option; `variantId` null: the product, whichever comes back. */
    byOption: { variantId: string | null; waiting: number }[];
}

/** "Tell me" per visitor per minute, as the enquiry form allows. */
const WATCHES_PER_WINDOW = 5;
const WATCH_WINDOW_MS = 60_000;
/** "Tell me" per address per hour, whatever visitor sends it. */
const PER_EMAIL = 5;
const PER_EMAIL_WINDOW_MS = 3_600_000;
/** Reads (offer, the stop page) per visitor per minute. */
const READS_PER_WINDOW = 60;
const READ_WINDOW_MS = 60_000;

function tooMany(): never {
    throw new HttpException("Too many requests. Try again shortly.", 429);
}

/** Every miss looks the same: no shop, another business's product alike. */
function notFound(): never {
    throw new NotFoundException("Nothing to show here");
}

/**
 * "Tell me when it's back" (DEC-174 U23, #1154), the API side.
 *
 * - **Public, site-scoped.** The site names the business; every read and
 *   write runs in its RLS context and filters on it too, so a product id of
 *   another business on this site is a 404 (`readWatchable`).
 * - **Offered only** while the business's BACK_IN_STOCK switch is on, its
 *   own email provider is connected (nobody else may email its customers,
 *   DEC-086 reversed) and the product, or the option, is sold out on that
 *   site. Otherwise the "Tell me" is refused with the reason, which the
 *   site reads first to hide the button.
 * - **Consent:** the ticked opt-in is consent to this one email. The
 *   address never becomes a contact or a marketing subscriber; a contact
 *   that already has it is named only so their revoked email consent stops
 *   it.
 * - **Once:** one open watch per address per product or option; asking
 *   again is the same watch. Each is emailed once (`back-in-stock.handler.ts`).
 * - **Abuse:** limited per visitor (the relayed address, as the shop's
 *   reads) and per address, as the enquiry form is.
 * - **Stop:** a signed token, read by a page with a button, never a link
 *   that stops on opening: mail scanners open links.
 */
@Injectable()
export class StockWatchService {
    constructor(
        // Not DI providers: per-instance defaults that tests can replace.
        @Optional()
        private readonly writes: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            WATCHES_PER_WINDOW,
            WATCH_WINDOW_MS,
        ),
        @Optional()
        private readonly perEmail: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            PER_EMAIL,
            PER_EMAIL_WINDOW_MS,
        ),
        @Optional()
        private readonly reads: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
    ) {}

    /** Whether "Tell me" is offered for the product, or one option. */
    async offer(
        siteId: string,
        productId: string,
        variantId: string | null,
        visitor: string | undefined,
    ): Promise<WatchOffer> {
        if (!this.reads.take(visitor ?? `site:${siteId}`)) tooMany();
        return this.inSite(siteId, async (organizationId, tx) => {
            const why = await this.refusal(tx, organizationId, {
                siteId,
                productId,
                variantId,
            });
            return { offered: why === null, why };
        });
    }

    /** Take a "Tell me": one watch per address per product or option. */
    async watch(
        siteId: string,
        productId: string,
        input: { email: string; variantId?: string | null; consent: boolean },
        visitor: string | undefined,
        now: Date = new Date(),
    ): Promise<WatchTaken> {
        if (input.consent !== true) {
            throw new BadRequestException({
                message: "Tick the box to be emailed when it's back.",
                field: "consent",
            });
        }
        const email = watchEmail(input.email);
        if (!email || isReservedContactEmail(email)) {
            throw new BadRequestException({
                message: "Enter an email like name@example.com.",
                field: "email",
            });
        }
        if (!this.writes.take(visitor ?? `site:${siteId}`)) tooMany();
        if (!this.perEmail.take(email)) tooMany();
        const variantId = input.variantId ?? null;
        return this.inSite(siteId, async (organizationId, tx) => {
            const why = await this.refusal(tx, organizationId, {
                siteId,
                productId,
                variantId,
            });
            if (why !== null) {
                // `details` is what the exception filter sends on: a bare
                // `reason` beside the message never reached the site (U24).
                throw new ConflictException({
                    message: WATCH_REFUSAL_WORDS[why],
                    reason: why,
                    details: { reason: why },
                });
            }
            const open = {
                organizationId,
                productId,
                variantId,
                email,
                toldAt: null,
                cancelledAt: null,
            };
            const already = await tx.stockWatch.findFirst({
                where: open,
                select: { id: true },
            });
            if (already) return { state: "waiting", stopToken: null };
            const contact = await tx.contact.findFirst({
                where: {
                    organizationId,
                    email: { equals: email, mode: "insensitive" },
                    mergedIntoId: null,
                    removedAt: null,
                },
                orderBy: { createdAt: "asc" },
                select: { id: true },
            });
            // ON CONFLICT DO NOTHING: a second "Tell me" racing this one
            // meets the open-watch index and makes nothing, without failing
            // the transaction.
            const made = await tx.stockWatch.createManyAndReturn({
                data: [
                    {
                        organizationId,
                        productId,
                        variantId,
                        siteId,
                        email,
                        contactId: contact?.id ?? null,
                        consentAt: now,
                    },
                ],
                skipDuplicates: true,
                select: { id: true },
            });
            return {
                state: "waiting",
                stopToken:
                    made.length > 0
                        ? signWatchToken(siteCodeSecret(), made[0].id)
                        : null,
            };
        });
    }

    /** The stop page: what the token's watch is for, and where it stands. */
    async read(
        siteId: string,
        token: string,
        visitor: string | undefined,
    ): Promise<WatchView> {
        if (!this.reads.take(visitor ?? `site:${siteId}`)) tooMany();
        const watchId = verifyWatchToken(siteCodeSecret(), token);
        if (!watchId) notFound();
        return this.inSite(siteId, async (organizationId, tx) => {
            const watch = await this.watchOf(
                tx,
                organizationId,
                siteId,
                watchId,
            );
            return view(watch);
        });
    }

    /**
     * "Stop waiting": the watch is stopped and never told. Stopping one told
     * or already stopped changes nothing and says where it stands.
     */
    async stop(
        siteId: string,
        token: string,
        visitor: string | undefined,
        now: Date = new Date(),
    ): Promise<WatchView> {
        if (!this.writes.take(visitor ?? `site:${siteId}`)) tooMany();
        const watchId = verifyWatchToken(siteCodeSecret(), token);
        if (!watchId) notFound();
        return this.inSite(siteId, async (organizationId, tx) => {
            await tx.stockWatch.updateMany({
                where: {
                    id: watchId,
                    organizationId,
                    siteId,
                    toldAt: null,
                    cancelledAt: null,
                },
                data: { cancelledAt: now },
            });
            const watch = await this.watchOf(
                tx,
                organizationId,
                siteId,
                watchId,
            );
            return view(watch);
        });
    }

    /**
     * Who is waiting for a product (U24's count in the workspace), as a
     * whole and per option. Whoever may read stock may read it
     * (`store:read`); never the addresses.
     */
    async countFor(
        ctx: OrganizationContext,
        productId: string,
    ): Promise<WatchCount> {
        authorize(ctx, "store:read");
        const { organizationId } = ctx;
        return runInOrgContext(organizationId, async () => {
            const product = await prisma.product.findFirst({
                where: { id: productId, organizationId },
                select: { id: true },
            });
            if (!product) throw new NotFoundException("Product not found");
            const groups = await prisma.stockWatch.groupBy({
                by: ["variantId"],
                where: {
                    organizationId,
                    productId,
                    toldAt: null,
                    cancelledAt: null,
                },
                _count: { _all: true },
            });
            const byOption = groups
                .map((g) => ({
                    variantId: g.variantId,
                    waiting: g._count._all,
                }))
                .sort((a, b) =>
                    (a.variantId ?? "").localeCompare(b.variantId ?? ""),
                );
            return {
                productId,
                waiting: byOption.reduce((sum, g) => sum + g.waiting, 0),
                byOption,
            };
        });
    }

    // ---- Helpers ------------------------------------------------------------

    /**
     * Why "Tell me" isn't offered, or null when it is. A product the site
     * doesn't sell is a 404, whatever the switches say.
     */
    private async refusal(
        tx: Tx,
        organizationId: string,
        input: { siteId: string; productId: string; variantId: string | null },
    ): Promise<WatchRefusal | null> {
        const item = await readWatchable(tx, organizationId, input);
        if (!item) notFound();
        if (!(await noticeOn(tx, organizationId, "BACK_IN_STOCK"))) {
            return "SWITCHED_OFF";
        }
        if ((await emailRoute(tx, organizationId)) === null) return "NO_EMAIL";
        return item.sellable ? "IN_STOCK" : null;
    }

    private async watchOf(
        tx: Tx,
        organizationId: string,
        siteId: string,
        watchId: string,
    ) {
        const watch = await tx.stockWatch.findFirst({
            where: { id: watchId, organizationId, siteId },
            select: {
                toldAt: true,
                cancelledAt: true,
                product: { select: { name: true } },
                variant: { select: { title: true } },
                organization: { select: { name: true } },
            },
        });
        if (!watch) notFound();
        return watch;
    }

    /** The site, its business, then `fn` in that business's RLS context. */
    private async inSite<T>(
        siteId: string,
        fn: (organizationId: string, tx: Tx) => Promise<T>,
    ): Promise<T> {
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                deletedAt: null,
            },
            select: { organizationId: true },
        });
        if (!site) notFound();
        const { organizationId } = site;
        return runInOrgContext(organizationId, () =>
            prisma.$transaction((tx) => fn(organizationId, tx)),
        );
    }
}

function view(watch: {
    toldAt: Date | null;
    cancelledAt: Date | null;
    product: { name: string };
    variant: { title: string } | null;
    organization: { name: string };
}): WatchView {
    return {
        state: watchState(watch),
        business: watch.organization.name,
        product: watch.variant
            ? `${watch.product.name} (${watch.variant.title})`
            : watch.product.name,
    };
}
