import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
    ServiceUnavailableException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { randomBytes } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { EntitlementService } from "../billing/entitlement.service";
import { authorize } from "../organizations/organization-policy";
import type { DomainHosting } from "./domain-hosting";
import { DOMAIN_HOSTING, HostingCallError } from "./domain-hosting";
import { hostingView, syncHosting } from "./domain-hosting-sync";
import type { DomainVerifier, VerificationFailure } from "./domain-verifier";
import { DOMAIN_VERIFIER, verificationRecordName } from "./domain-verifier";
import { isTestReservedHostname, TEST_RESERVED_HOSTNAME_MSG } from "./dto";

/** Input for {@link DomainsService.claim} — the validated {@link ClaimDomainDto}. */
export interface ClaimDomainInput {
    hostname: string;
    siteId?: string;
}

/** The DNS TXT record the org must publish to prove control of the hostname. */
export interface DnsTxtInstructions {
    type: "TXT";
    name: string; // e.g. "_saroh-verification.shop.acme.com"
    value: string; // the verificationToken
}

/**
 * Subdomain / custom-domain claim + verification (S2-007).
 *
 * Every operation is tenant-scoped by `ctx.organizationId` (taken from the
 * resolved {@link OrganizationContext}, proven by `OrganizationGuard`, never a
 * client-supplied value), so one org can never read, verify, or delete
 * another's domain. Ownership of a HOSTNAME is enforced two ways: the globally
 * unique `Domain.hostname` column makes a second org's claim on the same
 * hostname impossible (surfaced here as a 409 Conflict), and a hostname is only
 * LINKED to a Site after it reaches VERIFIED — so at most one org ever controls
 * a hostname and only via proven DNS control.
 */
@Injectable()
export class DomainsService {
    constructor(
        @Inject(DOMAIN_VERIFIER) private readonly verifier: DomainVerifier,
        private readonly entitlements: EntitlementService,
        // #859: null when hosting isn't set up on this instance (off).
        @Inject(DOMAIN_HOSTING)
        private readonly hosting: DomainHosting | null = null,
    ) {}

    /**
     * Claim a hostname for the org. Authorizes `domain:manage`, rejects an
     * already-claimed hostname (409 — globally unique), optionally binds a Site
     * (which must belong to the org), mints a random verification token, and
     * writes a PENDING row. Returns the domain plus the DNS TXT instructions the
     * org must publish before {@link verify} can succeed.
     */
    async claim(ctx: OrganizationContext, input: ClaimDomainInput) {
        authorize(ctx, "domain:manage");

        // Custom domains are a paid-plan entitlement (S7-005). The FREE default
        // has `customDomain: false`, so an un-subscribed org is refused here.
        if (
            !(await this.entitlements.can(ctx.organizationId, "customDomain"))
        ) {
            throw new ForbiddenException(
                "Custom domains require a paid plan; upgrade to add one.",
            );
        }

        const hostname = input.hostname.trim().toLowerCase();
        // DEC-071: `test.<H>` and `test--*` are test-release hosts. The DTO
        // refuses them at the edge; this keeps any other caller honest.
        if (isTestReservedHostname(hostname)) {
            throw new BadRequestException(TEST_RESERVED_HOSTNAME_MSG);
        }

        // Globally-unique guard: a hostname claimed by ANY org (this one or
        // another) blocks a new claim. Pre-check for a clear 409; the unique
        // index is the real backstop against a race.
        const existing = await prisma.domain.findUnique({
            where: { hostname },
        });
        if (existing) {
            throw new ConflictException(
                `Hostname "${hostname}" is already claimed`,
            );
        }

        if (input.siteId) {
            await this.requireOwnedSite(ctx, input.siteId);
        }

        const verificationToken = randomBytes(24).toString("hex");

        let domain;
        try {
            domain = await prisma.domain.create({
                data: {
                    organizationId: ctx.organizationId,
                    hostname,
                    siteId: input.siteId ?? null,
                    status: "PENDING",
                    verificationToken,
                    verificationMethod: "DNS_TXT",
                },
            });
        } catch (err) {
            // P2002 = unique constraint violation on `hostname` (lost the race).
            if ((err as { code?: string }).code === "P2002") {
                throw new ConflictException(
                    `Hostname "${hostname}" is already claimed`,
                );
            }
            throw err;
        }

        return {
            domain: this.withHosting(domain),
            dnsRecord: this.instructionsFor(domain),
        };
    }

    /**
     * Verify a claimed domain by checking DNS for its token. Authorizes
     * `domain:manage`, loads the org's own domain (404 otherwise), and asks the
     * verifier port. On success flips PENDING → VERIFIED (+ verifiedAt) and, if a
     * Site is bound, routes it by setting `Site.customDomainId`, then
     * registers the hostname with the host (#859). A domain already VERIFIED
     * is not re-checked in DNS; its hosting is synced instead: registered if
     * an earlier call failed (the retry), else its standing refreshed. A host
     * failure never undoes the verification: it is recorded on the row. A
     * failing check leaves the domain PENDING (never trusts the client,
     * never links).
     */
    async verify(ctx: OrganizationContext, domainId: string) {
        authorize(ctx, "domain:manage");

        const domain = await this.requireOwned(ctx, domainId);

        if (domain.status === "VERIFIED") {
            const synced = await syncHosting(this.hosting, domain);
            return { domain: this.withHosting(synced), verified: true };
        }

        const checkedAt = new Date();
        const outcome = await this.verifier.verify(
            domain.hostname,
            domain.verificationToken,
        );

        if (!outcome.ok) {
            // Leave it PENDING so the org can fix DNS and retry — and RECORD
            // the attempt (#200): when it ran and why it failed are the two
            // things the merchant needs while they wait on their registrar.
            const checked = await prisma.domain.update({
                where: { id: domain.id },
                data: {
                    lastCheckedAt: checkedAt,
                    lastCheckResult: outcome.reason,
                },
            });
            return {
                domain: this.withHosting(checked),
                verified: false,
                reason: outcome.reason satisfies VerificationFailure,
            };
        }

        const verified = await prisma.domain.update({
            where: { id: domain.id },
            data: {
                status: "VERIFIED",
                verifiedAt: checkedAt,
                lastCheckedAt: checkedAt,
                lastCheckResult: null,
            },
        });

        // Routing only happens AFTER verification: link the bound Site to this
        // now-controlled hostname.
        if (verified.siteId) {
            await prisma.site.update({
                where: { id: verified.siteId },
                data: { customDomainId: verified.id },
            });
        }

        const hosted = await syncHosting(this.hosting, verified);
        return { domain: this.withHosting(hosted), verified: true };
    }

    /**
     * List the org's claimed domains, newest first, each with the DNS record
     * it needs (#200) — the screen shows that record as something to copy,
     * and deriving it here keeps the record name's rule in one place.
     * Tenant-scoped by ctx.
     */
    async list(ctx: OrganizationContext) {
        authorize(ctx, "domain:manage");
        const domains = await prisma.domain.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
        });
        return domains.map((domain) => ({
            ...this.withHosting(domain),
            dnsRecord: this.instructionsFor(domain),
        }));
    }

    /**
     * Release a claimed domain. Authorizes `domain:manage`; cross-tenant or
     * missing ids 404. Deletes the hostname at the host FIRST (#859): if
     * that fails, nothing here changes and the merchant is told to try again
     * (a 503 with `reason: "hosting-unavailable"`), so no hostname is left
     * registered for a domain Saroh no longer holds. Then unlinks it from a
     * routed Site so no Site is left pointing at a deleted claim.
     */
    async remove(
        ctx: OrganizationContext,
        domainId: string,
    ): Promise<{ id: string; deleted: true }> {
        authorize(ctx, "domain:manage");

        const domain = await this.requireOwned(ctx, domainId);

        await this.removeFromHosting(domain);

        if (domain.siteId) {
            // Only clear the pointer if it still points at THIS domain.
            await prisma.site.updateMany({
                where: { id: domain.siteId, customDomainId: domain.id },
                data: { customDomainId: null },
            });
        }

        await prisma.domain.delete({ where: { id: domain.id } });

        return { id: domain.id, deleted: true };
    }

    /**
     * Delete the domain's hostname at the host. Only a domain that may be
     * registered is looked at: one with a hosting id, or a VERIFIED one whose
     * register may have worked with its answer lost. Hosting off with a
     * hosting id on the row refuses too: removing would orphan it.
     */
    private async removeFromHosting(domain: {
        hostname: string;
        status: string;
        hostingId: string | null;
    }): Promise<void> {
        if (!domain.hostingId && domain.status !== "VERIFIED") return;
        if (!this.hosting) {
            if (!domain.hostingId) return;
            throw hostingUnavailable();
        }
        try {
            await this.hosting.remove({
                id: domain.hostingId,
                hostname: domain.hostname,
            });
        } catch (err) {
            if (err instanceof HostingCallError) throw hostingUnavailable();
            throw err;
        }
    }

    /** A domain row with its hosting state (#859), as the workspace reads it. */
    private withHosting<
        T extends {
            hostname: string;
            status: string;
            hostingStatus: string | null;
            hostingError: string | null;
            hostingCheckedAt: Date | null;
        },
    >(domain: T) {
        return {
            ...domain,
            hosting: hostingView(domain, this.hosting !== null),
        };
    }

    /** The DNS TXT record the org must publish for a domain. */
    private instructionsFor(domain: {
        hostname: string;
        verificationToken: string;
    }): DnsTxtInstructions {
        return {
            type: "TXT",
            name: verificationRecordName(domain.hostname),
            value: domain.verificationToken,
        };
    }

    /**
     * Load a domain and assert it belongs to `ctx.organizationId`. Throws
     * `NotFoundException` for a missing OR cross-tenant id — a 404 (not 403) so a
     * caller can't probe which domains exist in another org.
     */
    private async requireOwned(ctx: OrganizationContext, domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId },
        });
        if (domain?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Domain not found");
        }
        return domain;
    }

    /**
     * Assert a Site belongs to `ctx.organizationId` before binding a claim to
     * it. 404 for a missing or cross-tenant Site.
     */
    private async requireOwnedSite(ctx: OrganizationContext, siteId: string) {
        const site = await prisma.site.findUnique({ where: { id: siteId } });
        if (site?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Site not found");
        }
        return site;
    }
}

/** The 503 a removal answers when the host couldn't delete the hostname. */
function hostingUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
        message:
            "We couldn't disconnect this domain from our hosting just now, so it hasn't been removed. Try again in a few minutes.",
        details: { reason: "hosting-unavailable" },
    });
}
