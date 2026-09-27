import { randomUUID } from "node:crypto";

import {
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { CustomerAccountStatus, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { auditMetadata } from "../audit/audit.service";
import {
    isReservedContactEmail,
    reservedAccountEmail,
} from "../contacts/contact-email";
import { authorize } from "../organizations/organization-policy";
import type { UnlinkMove, UnlinkMover, UnlinkScope } from "./unlink-plan";
import {
    applyUnlinkMoves,
    countUnlinkMoves,
    UNLINK_MOVERS,
    unlinkMoves,
    unlinkSentence,
} from "./unlink-plan";

/**
 * "This isn't them" (A4, DEC-049; round-2 plan A): staff undo a site
 * account's link to a contact it doesn't belong to.
 *
 * The account moves to a new separate contact (the reserved placeholder
 * email, a blank name, `source` "site-account"), taking every record it made
 * while linked (`unlink-plan.ts`), and its sessions end. The contact it left
 * loses its verified-email stamp, since the code proved the inbox, not the
 * person; and the account remembers it (`unlinkedFromContactId`), so
 * duplicate suggestions (C2) never pair the two again.
 *
 * Staff-side reads of the account sit here too: `siteAccountFor` is what
 * Customer Detail shows as "Signs in on your website as ‹email›".
 */

/** An account that signs in (or is blocked from it): not merged or removed. */
const SIGNS_IN: readonly CustomerAccountStatus[] = ["ACTIVE", "BLOCKED"];

/** The site account as staff see it on the contact it's linked to. */
export interface SiteAccountView {
    email: string;
    status: "ACTIVE" | "BLOCKED";
    linkedAt: string;
    lastSignedInAt: string | null;
    /**
     * Whether "This isn't them" applies: false on a contact the sign-in made
     * for itself (a separate contact, or a new one), where there is nobody
     * else to part it from.
     */
    canUnlink: boolean;
}

export interface UnlinkPreview {
    email: string;
    moves: UnlinkMove[];
    /** "2 bookings they made online move with them." */
    sentence: string;
}

export interface UnlinkResult {
    /** The new contact the account now sits on. */
    contactId: string;
    moves: UnlinkMove[];
}

/** A contact the sign-in made for itself has nobody to part from. */
export function contactIsTheAccountsOwn(contact: {
    email: string;
    source: string | null;
}): boolean {
    return (
        isReservedContactEmail(contact.email) ||
        contact.source === "site-account"
    );
}

export function toSiteAccountView(
    account: {
        email: string;
        status: CustomerAccountStatus;
        linkedAt: Date;
        lastSignedInAt: Date | null;
    },
    contact: { email: string; source: string | null },
): SiteAccountView {
    return {
        email: account.email,
        status: account.status === "BLOCKED" ? "BLOCKED" : "ACTIVE",
        linkedAt: account.linkedAt.toISOString(),
        lastSignedInAt: account.lastSignedInAt?.toISOString() ?? null,
        canUnlink: !contactIsTheAccountsOwn(contact),
    };
}

type Db = typeof prisma;

@Injectable()
export class AccountUnlinkService {
    constructor(
        @Optional() private readonly db: Db = prisma,
        @Optional()
        private readonly movers: readonly UnlinkMover[] = UNLINK_MOVERS,
    ) {}

    /** What "This isn't them" would move, for the confirm. */
    async preview(
        ctx: OrganizationContext,
        contactId: string,
    ): Promise<UnlinkPreview> {
        authorize(ctx, "contact:write");
        return this.db.$transaction(async (tx) => {
            const { account, scope } = await this.target(tx, ctx, contactId, {
                lock: false,
            });
            const moves = unlinkMoves(
                this.movers,
                await countUnlinkMoves(tx, scope, this.movers),
            );
            return {
                email: account.email,
                moves,
                sentence: unlinkSentence(moves),
            };
        });
    }

    /** "This isn't them": part the account from this contact. */
    async unlink(
        ctx: OrganizationContext,
        contactId: string,
        now: Date = new Date(),
    ): Promise<UnlinkResult> {
        authorize(ctx, "contact:write");
        return this.db.$transaction(async (tx) => {
            const { account, scope } = await this.target(tx, ctx, contactId, {
                lock: true,
            });
            const organizationId = ctx.organizationId;

            // The new contact can't take the account's email (the contact it
            // leaves may hold it), so it carries the placeholder built from
            // its own id, as a first sign-in's separate contact does.
            const separate = await tx.contact.create({
                data: {
                    organizationId,
                    email: `pending+${randomUUID()}@account.invalid`,
                    source: "site-account",
                },
                select: { id: true },
            });
            await tx.contact.update({
                where: { id: separate.id },
                data: { email: reservedAccountEmail(separate.id) },
            });

            const moved = await applyUnlinkMoves(
                tx,
                { ...scope, toContactId: separate.id },
                this.movers,
            );

            await tx.customerAccount.update({
                where: { id: account.id },
                data: {
                    contactId: separate.id,
                    unlinkedFromContactId: contactId,
                    linkedAt: now,
                },
            });
            await tx.customerSession.updateMany({
                where: {
                    organizationId,
                    accountId: account.id,
                    revokedAt: null,
                },
                data: { revokedAt: now },
            });
            await tx.contact.update({
                where: { id: contactId },
                data: { emailVerifiedAt: null, emailVerifiedVia: null },
            });

            const moves = unlinkMoves(this.movers, moved);
            await tx.auditEvent.create({
                data: {
                    action: "customer.account.unlink",
                    actorUserId: ctx.userId,
                    organizationId,
                    targetType: "contact",
                    targetId: contactId,
                    outcome: "SUCCESS",
                    // Ids and counts only: never the email.
                    metadata: auditMetadata(ctx.roleKey, {
                        accountId: account.id,
                        toContactId: separate.id,
                        moved: Object.fromEntries(
                            moves.map((m) => [m.key, m.count]),
                        ),
                    }),
                },
            });
            return { contactId: separate.id, moves };
        });
    }

    /**
     * The contact and the account that signs in on it, or a 404 (another
     * business, no such contact, no account). A contact the sign-in made
     * for itself is a 409: there is nobody to part it from.
     */
    private async target(
        tx: Prisma.TransactionClient,
        ctx: OrganizationContext,
        contactId: string,
        opts: { lock: boolean },
    ): Promise<{
        account: { id: string; email: string; linkedAt: Date };
        scope: UnlinkScope;
    }> {
        const organizationId = ctx.organizationId;
        if (opts.lock) {
            // One unlink at a time per contact, and none racing a sign-in
            // that is linking to it (account-linking.service locks the same
            // row).
            await tx.$queryRaw`SELECT id FROM "Contact"
                WHERE id = ${contactId} AND "organizationId" = ${organizationId}
                FOR UPDATE`;
        }
        const contact = await tx.contact.findFirst({
            where: { id: contactId, organizationId },
            select: { id: true, email: true, source: true },
        });
        if (!contact) throw new NotFoundException("Contact not found");
        const account = await tx.customerAccount.findFirst({
            where: {
                organizationId,
                contactId,
                status: { in: [...SIGNS_IN] },
            },
            select: { id: true, email: true, linkedAt: true },
        });
        if (!account) {
            throw new NotFoundException(
                "This customer doesn't sign in on your website",
            );
        }
        if (contactIsTheAccountsOwn(contact)) {
            throw new ConflictException(
                "This record was made when they signed in, so it's already theirs alone",
            );
        }
        return {
            account,
            scope: {
                organizationId,
                accountId: account.id,
                fromContactId: contactId,
                since: account.linkedAt,
            },
        };
    }
}
