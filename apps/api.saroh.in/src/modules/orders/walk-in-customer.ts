import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@saroh/database";

import { reservedPhoneEmail } from "../contacts/contact-email";
import {
    normaliseEmail,
    normalisePhone,
} from "../customer-workspace/duplicates";

/**
 * A walk-in who gives their phone is a customer (B13b, the user's rule of
 * 2026-09-28). New order finds them by that phone, or makes them, inside
 * the order's transaction, so the order joins their history, pairs in
 * duplicate matching and is reached by a privacy removal (C11).
 *
 * Phones are compared as C2's `duplicates.ts` compares them, which is what
 * E4's picker searches by: digits only, a twelve-digit number's leading 91
 * dropped ("+91 98450 00002" is "9845000002").
 *
 * Someone known by their phone alone gets the reserved
 * `phone+<random>@phone.invalid` placeholder as their email, on the contact
 * and on the store customer (`contacts/contact-email.ts`), since both need
 * one. Every reader treats it as no email.
 *
 * Nothing here tells the caller whether anyone was found: the answer is a
 * store customer id either way, and no refusal depends on who exists.
 */

type Tx = Prisma.TransactionClient;

export const WALK_IN_PHONE_MESSAGE = "That doesn't look like a phone number.";

/**
 * The phone as matched, or a 400: a phone too short to match anyone can't
 * keep them as a customer.
 */
export function walkInPhoneKey(phone: string): string {
    const key = normalisePhone(phone);
    if (!key) {
        throw new BadRequestException({
            message: WALK_IN_PHONE_MESSAGE,
            details: { field: "walkIn.phone" },
        });
    }
    return key;
}

/**
 * One phone at a time per business: two orders for the same new number at
 * once would otherwise each make a customer. Held to the end of the order's
 * transaction.
 */
export async function lockWalkInPhone(
    tx: Tx,
    scope: string,
    key: string,
): Promise<void> {
    const lock = `walk-in-phone:${scope}:${key}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
}

/**
 * A stored phone column, compared as `normalisePhone` compares: digits
 * only, a twelve-digit number's leading 91 dropped.
 */
function phoneOf(column: string): Prisma.Sql {
    const digits = Prisma.raw(
        `regexp_replace(coalesce(${column}, ''), '\\D', '', 'g')`,
    );
    return Prisma.sql`(CASE WHEN length(${digits}) = 12 AND left(${digits}, 2) = '91' THEN substr(${digits}, 3) ELSE ${digits} END)`;
}

/**
 * The business's contact with this phone, oldest first: never one removed
 * for privacy (C11) nor a merge's tombstone (C9).
 */
export async function contactByPhone(
    tx: Tx,
    organizationId: string,
    key: string,
): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT c.id FROM "Contact" c
        WHERE c."organizationId" = ${organizationId}
          AND c."removedAt" IS NULL
          AND c."mergedIntoId" IS NULL
          AND lower(c.email) NOT LIKE '%@removed.invalid'
          AND ${phoneOf(`c."phone"`)} = ${key}
        ORDER BY c."createdAt" ASC, c.id ASC
        LIMIT 1`);
    return rows[0]?.id ?? null;
}

/**
 * The storefront's customer with this phone, oldest first. Never one whose
 * details were removed (its placeholder email) or one linked to a contact
 * removed for privacy.
 */
async function storeCustomerWithPhone(
    tx: Tx,
    storeId: string,
    key: string,
): Promise<StoreCustomer | null> {
    const rows = await tx.$queryRaw<StoreCustomer[]>(
        Prisma.sql`
        SELECT cu.id, cu.email, cu."firstName", cu."lastName"
        FROM "Customer" cu
        WHERE cu."storeId" = ${storeId}
          AND lower(cu.email) NOT LIKE 'removed+%@removed.invalid'
          AND ${phoneOf(`cu."phone"`)} = ${key}
          AND NOT EXISTS (
              SELECT 1 FROM "CustomerIdentityLink" l
              JOIN "Contact" c ON c.id = l."contactId"
              WHERE l."customerId" = cu.id
                AND (c."removedAt" IS NOT NULL
                     OR lower(c.email) LIKE 'removed+%@removed.invalid')
          )
        ORDER BY cu."createdAt" ASC, cu.id ASC
        LIMIT 1`,
    );
    return rows[0] ?? null;
}

interface StoreCustomer {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
}

/** "Asha Rao" as first and last name. */
function nameParts(name: string | null): {
    firstName: string | null;
    lastName: string | null;
} {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    return {
        firstName: words[0] ?? null,
        lastName: words.length > 1 ? words.slice(1).join(" ") : null,
    };
}

/**
 * The storefront's customer for a phone: the one with it, else a new one
 * known by it (a placeholder email). No contact is made or linked here.
 */
export async function storeCustomerByPhone(
    tx: Tx,
    input: {
        storeId: string;
        organizationId: string | null;
        key: string;
        name: string | null;
        phone: string;
    },
): Promise<StoreCustomer & { made: boolean }> {
    const found = await storeCustomerWithPhone(tx, input.storeId, input.key);
    if (found) return { ...found, made: false };
    const made = await tx.customer.create({
        data: {
            storeId: input.storeId,
            organizationId: input.organizationId,
            email: reservedPhoneEmail(),
            ...nameParts(input.name),
            phone: input.phone,
        },
        select: { id: true, email: true, firstName: true, lastName: true },
    });
    return { ...made, made: true };
}

/**
 * A walk-in with a phone and no contact holding it: their storefront
 * customer (found by the phone or made), given a contact of their own and
 * linked to it by the staff member taking the order (MANUAL). A customer
 * found already linked keeps its link. One whose real email another contact
 * holds is left unlinked for staff, as C2 leaves it: two people are never
 * joined on an email alone.
 */
export async function walkInCustomerInTx(
    tx: Tx,
    input: {
        storeId: string;
        organizationId: string | null;
        userId: string;
        key: string;
        name: string;
        phone: string;
    },
): Promise<string> {
    const { storeId, organizationId, userId, key, name, phone } = input;
    const customer = await storeCustomerByPhone(tx, {
        storeId,
        organizationId,
        key,
        name,
        phone,
    });
    if (!organizationId) return customer.id;
    if (
        !customer.made &&
        (await tx.customerIdentityLink.count({
            where: { customerId: customer.id },
        })) > 0
    ) {
        return customer.id;
    }
    const email = normaliseEmail(customer.email);
    if (email) {
        const holder = await tx.contact.findFirst({
            where: {
                organizationId,
                email: { equals: email, mode: "insensitive" },
            },
            select: { id: true },
        });
        if (holder) return customer.id;
    }
    const contact = await tx.contact.create({
        data: {
            organizationId,
            email: email ?? reservedPhoneEmail(),
            // The name the storefront already has for them, else the one
            // given at the counter.
            ...(customer.firstName || customer.lastName
                ? {
                      firstName: customer.firstName,
                      lastName: customer.lastName,
                  }
                : nameParts(name)),
            phone,
            source: `store-customer:${customer.id}`,
        },
        select: { id: true },
    });
    await tx.customerIdentityLink.create({
        data: {
            organizationId,
            contactId: contact.id,
            customerId: customer.id,
            reason: "MANUAL",
            linkedByUserId: userId,
        },
        select: { id: true },
    });
    return customer.id;
}
