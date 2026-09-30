import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { isSerializationFailure } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    auditMetadata,
} from "../audit/audit.service";
import { businessTimezone } from "../bookings/staff-availability";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { modulePageState } from "../sites/module-pages";
import { effectiveStorefront } from "../sites/sells-from";
import {
    addressProblem,
    addressTaken,
    freeAddress,
    releaseExpired,
} from "../sites/site-address";
import { platformOrigin } from "../sites/site-origin";
import { allows, authorize } from "./organization-policy";
import type { WebAddressAvailability, WebAddressView } from "./web-address.dto";

/**
 * The business's web address (DEC-069, plan L2): reading it with its links,
 * checking a new one, and the owner changing it.
 *
 * The address is the site's `subdomain` when the business has a site, else
 * `Organization.slug`, the address reserved at setup (KTD-2). A change moves
 * both in one transaction. The old address is held for the business for 90
 * days in `AddressReservation` and forwards to the site while it is held
 * (`sites/site-moved.ts` answers the renderer); an old slug that never
 * served a site is held too, and forwards nowhere.
 *
 * "Is it free" is `sites/site-address.ts`, the rules setup and site creation
 * use, so the three can't disagree.
 */

/** How long an old address forwards and stays held (DEC-069, Q1). */
export const ADDRESS_HOLD_DAYS = 90;

/** At most this many old addresses held at once (KTD-9, Q2). */
export const MAX_HELD_ADDRESSES = 2;

export const CHANGE_UNAVAILABLE_MESSAGE =
    "Changing your web address isn't available yet";

const DAY_MS = 86_400_000;

// Stateless (it reads the flag rows on every call), as in `sells-from.ts`.
const flags = new FeatureFlagService();

type SiteDb = Pick<Prisma.TransactionClient, "site">;

/** The site whose address is the business's: see {@link businessSite}. */
interface BusinessSite {
    id: string;
    organizationId: string;
    subdomain: string | null;
    storefrontId: string | null;
    currentPublicationId: string | null;
}

const SITE_SELECT = {
    id: true,
    organizationId: true,
    subdomain: true,
    storefrontId: true,
    currentPublicationId: true,
} satisfies Prisma.SiteSelect;

/**
 * The business's website: its first published one — the one pay links and
 * autopay land on (`sites/site-origin.ts`) — else its first one. Null when
 * it has none.
 */
export async function businessSite(
    db: SiteDb,
    organizationId: string,
): Promise<BusinessSite | null> {
    const order = [{ createdAt: "asc" as const }, { id: "asc" as const }];
    const live = await db.site.findFirst({
        where: {
            organizationId,
            deletedAt: null,
            currentPublicationId: { not: null },
        },
        orderBy: order,
        select: SITE_SELECT,
    });
    if (live) return live;
    return db.site.findFirst({
        where: { organizationId, deletedAt: null },
        orderBy: order,
        select: SITE_SELECT,
    });
}

/** Whether changing the address is rolled out for this business. */
function changeRolledOut(organizationId: string): Promise<boolean> {
    return flags.isEnabled(FlagKey.WEB_ADDRESS_CHANGE, organizationId);
}

@Injectable()
export class WebAddressService {
    /**
     * `GET organizations/:id/web-address` — anyone who may see the business
     * details (`org:settings:read`).
     */
    async read(ctx: OrganizationContext): Promise<WebAddressView> {
        authorize(ctx, "org:settings:read");
        return this.view(ctx);
    }

    /**
     * `GET …/web-address/availability?address=` — whether this business
     * could move to `raw`, why not, and a free address like it when it is
     * taken. The business's own current address, and the ones it still
     * holds, are free to it.
     */
    async availability(
        ctx: OrganizationContext,
        raw: string,
    ): Promise<WebAddressAvailability> {
        authorize(ctx, "org:settings:read");
        const address = raw.trim().toLowerCase();
        const problem = addressProblem(address);
        if (problem) {
            return { address, ok: false, reason: problem, suggestion: null };
        }
        const site = await businessSite(prisma, ctx.organizationId);
        if (!(await this.takenFor(prisma, address, ctx.organizationId, site))) {
            return { address, ok: true, reason: null, suggestion: null };
        }
        return {
            address,
            ok: false,
            reason: takenMessage(address),
            suggestion: await freeAddress(prisma, address, ctx.organizationId),
        };
    }

    /**
     * `PUT organizations/:id/web-address` — the owner moves the business to
     * a new address (`org:address:update`, with `WEB_ADDRESS_CHANGE` on).
     *
     * One serializable transaction, with the organization row locked so two
     * changes of one business queue up:
     * 1. the new address is checked, and a hold on it that has run out is
     *    cleared; taken → 409 with a suggestion;
     * 2. a change that would leave the business holding more than two old
     *    addresses (it holds the site's and, when it differs, the setup
     *    address) → 409 naming the day it fits;
     * 3. the old site address is held for 90 days and forwards to the site;
     *    an old setup address that differs is held too, forwarding nowhere;
     * 4. the business's own hold on the new address (a change back) goes;
     * 5. `Organization.slug` and the site's `subdomain` move;
     * 6. the audit row says `{ from, to }`.
     *
     * The same address again is a no-op. Two businesses racing for one
     * address: one wins, the other gets the 409 (the unique columns, or
     * Postgres's serialization check, refuse the second).
     */
    async change(
        ctx: OrganizationContext,
        raw: string,
    ): Promise<WebAddressView> {
        authorize(ctx, "org:address:update");
        const organizationId = ctx.organizationId;
        if (!(await changeRolledOut(organizationId))) {
            throw new ForbiddenException(CHANGE_UNAVAILABLE_MESSAGE);
        }
        const address = raw.trim().toLowerCase();
        const problem = addressProblem(address);
        if (problem) {
            throw new BadRequestException({
                message: problem,
                details: { field: "address" },
            });
        }

        // A hold on the new address that has run out goes first, before the
        // serializable snapshot is taken. Under RLS `releaseExpired` deletes
        // on another connection (it reads across businesses); inside the
        // transaction, a row it removed after the snapshot would still be
        // seen, and the business's own delete of it would fail as a lost
        // race: "is taken", once, on a change back to its own old address.
        await releaseExpired(prisma, address);
        try {
            await prisma.$transaction((tx) => this.move(tx, ctx, address), {
                isolationLevel: "Serializable",
            });
        } catch (error) {
            if (isRaceLost(error)) {
                throw await this.takenError(address, organizationId);
            }
            throw error;
        }
        return this.view(ctx);
    }

    /** The change itself, inside the caller's transaction. */
    private async move(
        tx: Prisma.TransactionClient,
        ctx: OrganizationContext,
        address: string,
    ): Promise<void> {
        const organizationId = ctx.organizationId;
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
        const org = await tx.organization.findUniqueOrThrow({
            where: { id: organizationId },
            select: { slug: true },
        });
        const site = await businessSite(tx, organizationId);
        const from = site?.subdomain ?? org.slug;
        if (from === address) return;

        await releaseExpired(tx, address);
        if (await this.takenFor(tx, address, organizationId, site)) {
            throw await this.takenError(address, organizationId, tx);
        }

        const now = new Date();
        const held = await tx.addressReservation.findMany({
            where: {
                organizationId,
                reservedUntil: { gt: now },
                address: { not: address },
            },
            orderBy: { reservedUntil: "asc" },
            select: { address: true, reservedUntil: true },
        });
        // What this change holds: the site's address, and the setup address
        // when it differs from it (a site on a variant, or no site). Both
        // count, so one change never takes the business past the limit.
        const adding = new Set<string>();
        if (site?.subdomain) adding.add(site.subdomain);
        if (org.slug !== address) adding.add(org.slug);
        for (const h of held) adding.delete(h.address);
        const over = held.length + adding.size - MAX_HELD_ADDRESSES;
        if (over > 0) {
            // The day enough holds have run out for this change to fit.
            // At most two are added, so `over` never exceeds `held.length`.
            const first = held[over - 1];
            const zone = await businessTimezone(tx, organizationId);
            const on = DateTime.fromJSDate(first.reservedUntil)
                .setZone(zone)
                .toFormat("d LLL yyyy");
            throw new ConflictException({
                message: `You can change your address again on ${on}`,
                details: {
                    field: "address",
                    reason: "limit",
                    availableOn: first.reservedUntil.toISOString(),
                },
            });
        }

        const until = new Date(now.getTime() + ADDRESS_HOLD_DAYS * DAY_MS);
        // A change back to an address the business still holds: the hold
        // goes, so the address never forwards to itself. Only a live one:
        // one that ran out is `releaseExpired`'s, which may have removed it
        // on another connection since this transaction's snapshot.
        await tx.addressReservation.deleteMany({
            where: { organizationId, address, reservedUntil: { gt: now } },
        });
        if (site?.subdomain) {
            await this.hold(tx, organizationId, site.subdomain, {
                siteId: site.id,
                redirectUntil: until,
                reservedUntil: until,
            });
        }
        if (org.slug !== site?.subdomain && org.slug !== address) {
            // The setup address, when it isn't the site's (a site that took
            // a variant, or no site at all): held, but nothing was ever
            // served there, so it forwards nowhere.
            await this.hold(tx, organizationId, org.slug, {
                siteId: null,
                redirectUntil: null,
                reservedUntil: until,
            });
        }

        await tx.organization.update({
            where: { id: organizationId },
            data: { slug: address },
        });
        if (site) {
            await tx.site.update({
                where: { id: site.id },
                data: { subdomain: address },
            });
        }
        await tx.auditEvent.create({
            data: {
                action: AuditAction.OrganizationAddressChanged,
                actorUserId: ctx.userId,
                organizationId,
                targetType: "organization",
                targetId: organizationId,
                outcome: AuditOutcome.Success,
                metadata: auditMetadata(ctx.roleKey, { from, to: address }),
            },
        });
    }

    /** Hold `address` for the business, replacing any row it had for it. */
    private async hold(
        tx: Prisma.TransactionClient,
        organizationId: string,
        address: string,
        row: {
            siteId: string | null;
            redirectUntil: Date | null;
            reservedUntil: Date;
        },
    ): Promise<void> {
        // A hold of another business's that ran out before this business
        // took the address would stand in the way of the unique column.
        await releaseExpired(tx, address);
        // Only a live hold: an expired one went with `releaseExpired`, maybe
        // on another connection (above).
        await tx.addressReservation.deleteMany({
            where: {
                organizationId,
                address,
                reservedUntil: { gt: new Date() },
            },
        });
        await tx.addressReservation.create({
            data: { organizationId, address, ...row },
        });
    }

    /**
     * Taken for this business: by another business (its setup address, its
     * site, or its hold), or by another of this business's own sites — a
     * site's address is unique, and only the business's site moves.
     */
    private async takenFor(
        db: Pick<
            Prisma.TransactionClient,
            "organization" | "site" | "addressReservation"
        >,
        address: string,
        organizationId: string,
        site: BusinessSite | null,
    ): Promise<boolean> {
        if (await addressTaken(db, address, organizationId)) return true;
        const other = await db.site.findFirst({
            where: {
                organizationId,
                subdomain: address,
                ...(site ? { id: { not: site.id } } : {}),
            },
            select: { id: true },
        });
        return other !== null;
    }

    private async takenError(
        address: string,
        organizationId: string,
        db: Pick<
            Prisma.TransactionClient,
            "organization" | "site" | "addressReservation"
        > = prisma,
    ): Promise<ConflictException> {
        const suggestion = await freeAddress(db, address, organizationId);
        return new ConflictException({
            message: takenMessage(address),
            details: {
                field: "address",
                reason: "taken",
                ...(suggestion ? { suggestion } : {}),
            },
        });
    }

    /** The read, for a caller already authorized. */
    private async view(ctx: OrganizationContext): Promise<WebAddressView> {
        const organizationId = ctx.organizationId;
        const now = new Date();
        const [org, site, rolledOut, held] = await Promise.all([
            prisma.organization.findUniqueOrThrow({
                where: { id: organizationId },
                select: { slug: true },
            }),
            businessSite(prisma, organizationId),
            changeRolledOut(organizationId),
            prisma.addressReservation.findMany({
                where: { organizationId, reservedUntil: { gt: now } },
                orderBy: [{ reservedUntil: "asc" }, { address: "asc" }],
                select: {
                    address: true,
                    redirectUntil: true,
                    reservedUntil: true,
                },
            }),
        ]);
        const address = site?.subdomain ?? org.slug;
        const domain = site
            ? await prisma.domain.findFirst({
                  where: {
                      organizationId,
                      siteId: site.id,
                      status: "VERIFIED",
                  },
                  orderBy: { verifiedAt: "asc" },
                  select: { hostname: true },
              })
            : null;
        const platform = platformOrigin(address);
        const origin = domain ? `https://${domain.hostname}` : platform;
        // Live: published, and reachable somewhere — a site that has no
        // address yet (plan L5) and no domain is served nowhere.
        const live =
            site !== null &&
            site.currentPublicationId !== null &&
            (domain !== null || site.subdomain !== null);
        const [shop, book] = live
            ? await Promise.all([
                  shopLive(site, organizationId),
                  bookLive(organizationId),
              ])
            : [false, false];

        return {
            address,
            origin,
            platformOrigin: platform,
            customDomain: domain?.hostname ?? null,
            links: {
                site: live ? origin : null,
                shop: shop ? `${origin}/shop` : null,
                book: book ? `${origin}/book` : null,
            },
            previous: held.map((row) => ({
                address: row.address,
                redirectUntil: row.redirectUntil
                    ? row.redirectUntil.toISOString()
                    : null,
                reservedUntil: row.reservedUntil.toISOString(),
            })),
            changeAvailable: rolledOut,
            canChange: rolledOut && allows(ctx, "org:address:update"),
        };
    }
}

/** A published product listed where the site sells from. */
const LISTED = {
    listings: { some: { product: { status: "PUBLISHED" } } },
} satisfies Prisma.StoreWhereInput;

/**
 * Whether `/shop` serves (KTD-8): the shop rolled out, Commerce rolled out
 * and on (the Shop page's own gate), an effective Sells from, and at least
 * one published product listed there.
 */
async function shopLive(
    site: BusinessSite,
    organizationId: string,
): Promise<boolean> {
    const [state, storefront] = await Promise.all([
        modulePageState("SHOP", organizationId),
        effectiveStorefront(prisma, site),
    ]);
    if (state.state !== "on" || !storefront) return false;
    const listed = await prisma.store.findFirst({
        where: { id: storefront.id, organizationId, ...LISTED },
        select: { id: true },
    });
    return listed !== null;
}

/** Whether `/book` serves: Appointments rolled out and on. */
async function bookLive(organizationId: string): Promise<boolean> {
    return (await modulePageState("BOOK", organizationId)).state === "on";
}

function takenMessage(address: string): string {
    return `${address}.saroh.app is taken`;
}

/** Lost a race for the address: a unique column, or serialization. */
function isRaceLost(error: unknown): boolean {
    if (isSerializationFailure(error)) return true;
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: unknown }).code === "P2002"
    );
}
