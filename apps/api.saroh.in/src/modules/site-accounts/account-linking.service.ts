import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { CustomerAccount, Prisma } from "@saroh/database";

import { reservedAccountEmail } from "../contacts/contact-email";
import { resolveContact } from "../customer-workspace/resolve-contact";
import {
    CustomerAccountRepository,
    normaliseAccountEmail,
} from "./customer-account.repository";

/**
 * Who a verified sign-in is (DEC-049; round-2 plan A).
 *
 * A4 owns this file. A2 built `linkOrCreate`, the one call a verified code
 * needs; A4 reviewed it against the plan, stamps a verified link, and adds
 * the workspace badge and "This isn't them" (`account-unlink.service.ts`,
 * `unlink-plan.ts`). C9 routes the contact through `resolveContact`
 * (`resolveLinkTarget`, below).
 *
 * The rule, for a verified email `e` in one business:
 * - an ACTIVE account holds `e` → sign in to it;
 * - a MERGED account holds `e` → no session; the answer names the
 *   survivor's email, masked, and nothing is created;
 * - a BLOCKED account holds `e` → no session;
 * - no account, and no contact holds `e` → a new contact with `e`, stamped
 *   verified by the code, and an account on it;
 * - no account, and the contact holding `e` is verified with no live
 *   account → an account on that contact;
 * - no account, and the contact holding `e` is unverified or already has an
 *   account under another email → a separate contact with the reserved
 *   placeholder email, and an account on it. Staff see the pair in
 *   suggestions (C2) and merge it; nothing here joins them.
 *
 * The contact holding `e` is locked (`FOR UPDATE`) before deciding, so two
 * first sign-ins for one email cannot both link it. Two first sign-ins for
 * an email no contact holds race on the contact's unique email instead: the
 * loser's transaction fails with P2002 and the caller runs it again, when
 * it finds the winner's account.
 */
export type SignInIdentity =
    | { kind: "signed-in"; account: CustomerAccount }
    | { kind: "merged"; maskedEmail: string }
    | { kind: "blocked" };

/** "farah@example.in" → "f…@example.in": the first letter and the domain. */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf("@");
    if (at < 1) return "…";
    return `${email[0]}…@${email.slice(at + 1)}`;
}

const MAX_MERGE_HOPS = 5;

/**
 * Every contact id `linkOrCreate` links an account to passes through here:
 * C9's `resolveContact` (`FOR SHARE`, one hop through `mergedIntoId`), so a
 * sign-in racing a merge lands on the survivor, and a merged-away contact
 * is never linked. A contact that has gone (or been removed for privacy)
 * resolves to null, and the sign-in makes a separate contact instead.
 */
export async function resolveLinkTarget(
    tx: Prisma.TransactionClient,
    contactId: string,
): Promise<string | null> {
    const resolved = await resolveContact(tx, contactId);
    if (!resolved || resolved.removed) return null;
    return resolved.id;
}

@Injectable()
export class AccountLinkingService {
    constructor(private readonly accounts: CustomerAccountRepository) {}

    async linkOrCreate(
        tx: Prisma.TransactionClient,
        organizationId: string,
        rawEmail: string,
        now: Date,
    ): Promise<SignInIdentity> {
        const email = normaliseAccountEmail(rawEmail);
        const existing = await this.accounts.findLiveByEmail(
            organizationId,
            email,
            tx,
        );
        if (existing) return this.signInTo(tx, existing, now);

        const holders = await tx.$queryRaw<
            { id: string; emailVerifiedAt: Date | null }[]
        >`SELECT id, "emailVerifiedAt" FROM "Contact"
          WHERE "organizationId" = ${organizationId} AND lower(email) = ${email}
          ORDER BY "createdAt" ASC
          FOR UPDATE`;

        if (holders.length === 0) {
            const contact = await tx.contact.create({
                data: {
                    organizationId,
                    email,
                    source: "site-account",
                    emailVerifiedAt: now,
                    emailVerifiedVia: "SIGN_IN_CODE",
                },
                select: { id: true },
            });
            return this.open(tx, organizationId, contact.id, email, now);
        }

        const holder = holders.length === 1 ? holders[0] : undefined;
        const target = holder?.emailVerifiedAt
            ? await resolveLinkTarget(tx, holder.id)
            : null;
        if (target) {
            const taken = await this.accounts.findLiveForContact(
                organizationId,
                target,
                tx,
            );
            if (!taken) {
                // The code proves the inbox again: the stamp says so now.
                await tx.contact.update({
                    where: { id: target },
                    data: {
                        emailVerifiedAt: now,
                        emailVerifiedVia: "SIGN_IN_CODE",
                    },
                });
                return this.open(tx, organizationId, target, email, now);
            }
        }

        // A separate contact: it cannot hold the email, so it carries the
        // reserved placeholder built from its own id.
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
        return this.open(tx, organizationId, separate.id, email, now);
    }

    private async open(
        tx: Prisma.TransactionClient,
        organizationId: string,
        contactId: string,
        email: string,
        now: Date,
    ): Promise<SignInIdentity> {
        const account = await this.accounts.create(
            { organizationId, contactId, email, verifiedAt: now },
            tx,
        );
        return { kind: "signed-in", account };
    }

    private async signInTo(
        tx: Prisma.TransactionClient,
        account: CustomerAccount,
        now: Date,
    ): Promise<SignInIdentity> {
        if (account.status === "BLOCKED") return { kind: "blocked" };
        if (account.status === "MERGED") {
            let survivor: CustomerAccount | null = account;
            for (let hop = 0; hop < MAX_MERGE_HOPS; hop += 1) {
                if (!survivor?.mergedIntoId) break;
                survivor = await tx.customerAccount.findFirst({
                    where: {
                        id: survivor.mergedIntoId,
                        organizationId: account.organizationId,
                    },
                });
            }
            return {
                kind: "merged",
                maskedEmail: maskEmail(survivor?.email ?? account.email),
            };
        }
        const signedIn = await tx.customerAccount.update({
            where: { id: account.id },
            data: { lastSignedInAt: now },
        });
        return { kind: "signed-in", account: signedIn };
    }
}
