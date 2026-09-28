import {
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { Prisma, prisma, runInOrgContext } from "@saroh/database";

import type { EmailOutcome } from "../../common/email";
import { sendSiteEmailChangedEmail } from "../../common/email";
import { structuredLogger } from "../../common/logging/structured-logger";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import { normaliseAccountEmail } from "./customer-account.repository";
import type { CustomerContext } from "./customer-context.decorator";
import type { ChangeEmailCodeDto, ChangeEmailDto } from "./dto";
import { cleanBusinessName } from "./sender-name";
import type { CodeRequested } from "./sign-in-codes.service";
import {
    changeDestinationHashFor,
    SignInCodesService,
} from "./sign-in-codes.service";
import type { SiteHost } from "./site-host";
import { resolveSiteHost } from "./site-host";
import type { SiteRelay } from "./site-relay";

/**
 * A customer changing their sign-in email from Me (round-2 plan A, A5;
 * ADR-011 "Email changes").
 *
 * 1. A code goes to the **new** address, under a destination bound to the
 *    account (`changeDestinationHashFor`), with the same limits, challenge
 *    and "couldn't send" answer as a sign-in code.
 * 2. The right code changes the account's email, when no other account of
 *    the business holds it. The contact's email follows only when the
 *    contact held the old one and no other contact holds the new one (and
 *    stays verified); otherwise the contact keeps what it had and C2's
 *    suggestions show the pair.
 * 3. Every other session of the account is revoked, and the old address is
 *    told, from Saroh's identity sender, that the sign-in email changed.
 *
 * The customer always gets the same answer (`{ done: true }`), whether the
 * email changed, was already theirs, or belongs to another account: the
 * answer never says whether an email has an account here. A staff edit of
 * a contact's email (C8) never touches the sign-in email.
 */

export const EMAIL_CHANGED_SENDER = Symbol("EMAIL_CHANGED_SENDER");

export type EmailChangedSender = (
    to: string,
    details: { businessName: string },
) => Promise<EmailOutcome>;

/** What a change answers, the same every time. */
export interface EmailChanged {
    done: true;
}

type Applied = { changed: false } | { changed: true; oldEmail: string };

/**
 * How many different new addresses one account may send change codes to in
 * a day. A signed-in customer is spared the business's new-destination
 * ceiling, so this keeps one account from using the merchant's sender to
 * mail strangers. Counted in process, like the other code limits.
 */
export const CHANGE_DESTINATIONS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EmailChangeService {
    /** Per org and account: the day's window start and its addresses. */
    private readonly destinations = new Map<
        string,
        { since: number; emails: Set<string> }
    >();

    constructor(
        private readonly codes: SignInCodesService,
        @Optional()
        @Inject(EMAIL_CHANGED_SENDER)
        private readonly notify: EmailChangedSender = sendSiteEmailChangedEmail,
    ) {}

    /** Send a code to the new address. */
    async requestCode(
        customer: CustomerContext,
        relay: SiteRelay,
        dto: ChangeEmailCodeDto,
    ): Promise<CodeRequested> {
        const site = await this.siteOf(customer, relay);
        return runInOrgContext(site.organizationId, async () => {
            await assertOrganizationOpen(site.organizationId);
            const now = new Date();
            const email = normaliseAccountEmail(dto.email);
            this.takeDestination(
                site.organizationId,
                customer.accountId,
                email,
                now,
            );
            const addressBusy = this.codes.takeAddress(site, relay, now);
            return this.codes.sendCode(site, relay, email, {
                destinationHash: changeDestinationHashFor(
                    site.organizationId,
                    customer.accountId,
                    email,
                ),
                // A signed-in customer, not a stranger: the business's
                // new-destination ceiling is not theirs to spend.
                newDestination: false,
                addressBusy,
                challenge: dto.challenge,
                now,
            });
        });
    }

    /** Count `email` in the account's day, or refuse a sixth new address. */
    private takeDestination(
        organizationId: string,
        accountId: string,
        email: string,
        now: Date,
    ): void {
        const key = `${organizationId}:${accountId}`;
        const at = now.getTime();
        let day = this.destinations.get(key);
        if (!day || at - day.since >= DAY_MS) {
            day = { since: at, emails: new Set() };
            this.destinations.set(key, day);
        }
        if (day.emails.has(email)) return;
        if (day.emails.size >= CHANGE_DESTINATIONS_PER_DAY) {
            const retryAfter = Math.ceil((day.since + DAY_MS - at) / 1000);
            throw new HttpException(
                {
                    message:
                        "You've tried a few new addresses today. Try again tomorrow.",
                    details: { reason: "limit", retryAfter },
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        day.emails.add(email);
    }

    /** Trade the code for the change. */
    async confirm(
        customer: CustomerContext,
        relay: SiteRelay,
        dto: ChangeEmailDto,
    ): Promise<EmailChanged> {
        const site = await this.siteOf(customer, relay);
        const applied = await runInOrgContext(site.organizationId, async () => {
            await assertOrganizationOpen(site.organizationId);
            const now = new Date();
            const email = normaliseAccountEmail(dto.email);
            const destinationHash = changeDestinationHashFor(
                site.organizationId,
                customer.accountId,
                email,
            );
            this.codes.takeVerifyTry(site, relay, destinationHash, now);
            await this.codes.consumeCode(
                site.organizationId,
                destinationHash,
                dto.code,
                now,
            );
            return this.apply(customer, email, now);
        });
        if (applied.changed) await this.tellOldAddress(site, applied.oldEmail);
        return { done: true };
    }

    /**
     * Move the account (and, when it follows, the contact) to `email`, and
     * sign out every other session. Runs in the caller's org context.
     */
    async apply(
        customer: Pick<
            CustomerContext,
            "organizationId" | "accountId" | "sessionId"
        >,
        email: string,
        now: Date,
    ): Promise<Applied> {
        const { organizationId, accountId } = customer;
        try {
            return await prisma.$transaction(async (tx) => {
                const account = await tx.customerAccount.findFirst({
                    where: { id: accountId, organizationId, status: "ACTIVE" },
                    select: { id: true, email: true, contactId: true },
                });
                if (!account) throw new NotFoundException();
                if (account.email === email) return { changed: false };

                const taken = await tx.customerAccount.count({
                    where: {
                        organizationId,
                        email,
                        status: { not: "REMOVED" },
                        id: { not: account.id },
                    },
                });
                if (taken > 0) return { changed: false };

                await tx.customerAccount.update({
                    where: { id: account.id },
                    data: { email, emailVerifiedAt: now },
                });

                const contact = await tx.contact.findFirst({
                    where: { id: account.contactId, organizationId },
                    select: { email: true },
                });
                const heldOld =
                    contact !== null &&
                    normaliseAccountEmail(contact.email) === account.email;
                if (heldOld) {
                    const holder = await tx.contact.count({
                        where: {
                            organizationId,
                            id: { not: account.contactId },
                            email: { equals: email, mode: "insensitive" },
                        },
                    });
                    if (holder === 0) {
                        await tx.contact.update({
                            where: { id: account.contactId },
                            data: {
                                email,
                                emailVerifiedAt: now,
                                emailVerifiedVia: "SIGN_IN_CODE",
                            },
                        });
                    }
                }

                await tx.customerSession.updateMany({
                    where: {
                        organizationId,
                        accountId: account.id,
                        revokedAt: null,
                        id: { not: customer.sessionId },
                    },
                    data: { revokedAt: now },
                });
                return { changed: true, oldEmail: account.email };
            });
        } catch (error) {
            // Another account, or contact, took the email between the check
            // and the write: nothing changed, and the answer is the same.
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                return { changed: false };
            }
            throw error;
        }
    }

    /** The notice to the old address. A failed send never undoes the change. */
    private async tellOldAddress(site: SiteHost, to: string): Promise<void> {
        let outcome: EmailOutcome;
        try {
            outcome = await this.notify(to, {
                businessName: cleanBusinessName(site.businessName, site.host),
            });
        } catch {
            outcome = "failed";
        }
        if (outcome !== "sent") {
            // No address in the line: it names the business and the outcome.
            structuredLogger.error("site_email_changed_notice_failed", {
                organizationId: site.organizationId,
                outcome,
            });
        }
    }

    /** The site the session is on (the guard already matched the two). */
    private async siteOf(
        customer: CustomerContext,
        relay: SiteRelay,
    ): Promise<SiteHost> {
        const site = await resolveSiteHost(relay.host);
        if (
            site.organizationId !== customer.organizationId ||
            site.siteId !== customer.siteId
        ) {
            throw new NotFoundException();
        }
        return site;
    }
}
