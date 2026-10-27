import { Injectable } from "@nestjs/common";
import type {
    CustomerAccount,
    CustomerAccountStatus,
    Prisma,
} from "@saroh/database";
import { prisma } from "@saroh/database";

/**
 * Reads and writes of `CustomerAccount`, a business's customer signed in on
 * its site (ADR-011, DEC-037). Round-2 plan A, A1: the table and its first
 * reads; sign-in (A2), the session (A3) and linking (A4) build on these.
 *
 * An account holds a verified email or a verified phone, at least one
 * (DEC-196): the database's CHECK and `createByPhone` keep it so.
 *
 * Every call names the organization, so a query can never cross businesses
 * even where row-level security is not yet enforced. "Live" means any status
 * but REMOVED: a MERGED account keeps its email reserved (DEC-049), and the
 * partial unique indexes hold exactly the live rows.
 */

/** The statuses that hold an email and a contact (every one but REMOVED). */
export const LIVE_ACCOUNT_STATUSES: readonly CustomerAccountStatus[] = [
    "ACTIVE",
    "BLOCKED",
    "MERGED",
] as const;

/** A sign-in email as it is stored and compared: trimmed and lower-cased. */
export function normaliseAccountEmail(email: string): string {
    return email.trim().toLowerCase();
}

type Db = Pick<Prisma.TransactionClient, "customerAccount">;

@Injectable()
export class CustomerAccountRepository {
    /** The live account holding `email` in this business, if any. */
    findLiveByEmail(
        organizationId: string,
        email: string,
        db: Db = prisma,
    ): Promise<CustomerAccount | null> {
        return db.customerAccount.findFirst({
            where: {
                organizationId,
                email: normaliseAccountEmail(email),
                status: { in: [...LIVE_ACCOUNT_STATUSES] },
            },
        });
    }

    /** The live account holding this verified phone (E.164), if any. */
    findLiveByPhone(
        organizationId: string,
        phoneE164: string,
        db: Db = prisma,
    ): Promise<CustomerAccount | null> {
        return db.customerAccount.findFirst({
            where: {
                organizationId,
                phoneE164,
                status: { in: [...LIVE_ACCOUNT_STATUSES] },
            },
        });
    }

    /** The live account linked to this contact, if any. */
    findLiveForContact(
        organizationId: string,
        contactId: string,
        db: Db = prisma,
    ): Promise<CustomerAccount | null> {
        return db.customerAccount.findFirst({
            where: {
                organizationId,
                contactId,
                status: { in: [...LIVE_ACCOUNT_STATUSES] },
            },
        });
    }

    /**
     * Make an ACTIVE account for a contact with a just-verified email. The
     * database refuses a second live account for the email or the contact
     * (P2002), and a contact from another business (P2003); the caller
     * decides what that means.
     */
    create(
        input: {
            organizationId: string;
            contactId: string;
            email: string;
            verifiedAt: Date;
        },
        db: Db = prisma,
    ): Promise<CustomerAccount> {
        return db.customerAccount.create({
            data: {
                organizationId: input.organizationId,
                contactId: input.contactId,
                email: normaliseAccountEmail(input.email),
                emailVerifiedAt: input.verifiedAt,
                linkedAt: input.verifiedAt,
                lastSignedInAt: input.verifiedAt,
            },
        });
    }

    /**
     * Make an ACTIVE phone-only account (DEC-196): a just-verified phone and
     * no email. The database refuses a second live account for the phone
     * (P2002), as for an email.
     */
    createByPhone(
        input: {
            organizationId: string;
            contactId: string;
            phoneE164: string;
            verifiedAt: Date;
        },
        db: Db = prisma,
    ): Promise<CustomerAccount> {
        return db.customerAccount.create({
            data: {
                organizationId: input.organizationId,
                contactId: input.contactId,
                phoneE164: input.phoneE164,
                phoneVerifiedAt: input.verifiedAt,
                linkedAt: input.verifiedAt,
                lastSignedInAt: input.verifiedAt,
            },
        });
    }
}
