import {
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { randomBytes } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { DomainVerifier } from "./domain-verifier";
import { DOMAIN_VERIFIER, verificationRecordName } from "./domain-verifier";

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

        const hostname = input.hostname.trim().toLowerCase();

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

        return { domain, dnsRecord: this.instructionsFor(domain) };
    }

    /**
     * Verify a claimed domain by checking DNS for its token. Authorizes
     * `domain:manage`, loads the org's own domain (404 otherwise), and asks the
     * verifier port. On success flips PENDING → VERIFIED (+ verifiedAt) and, if a
     * Site is bound, routes it by setting `Site.customDomainId`. Idempotent: a
     * domain already VERIFIED is returned unchanged. A failing check leaves the
     * domain PENDING (never trusts the client, never links).
     */
    async verify(ctx: OrganizationContext, domainId: string) {
        authorize(ctx, "domain:manage");

        const domain = await this.requireOwned(ctx, domainId);

        if (domain.status === "VERIFIED") {
            return { domain, verified: true };
        }

        const ok = await this.verifier.verify(
            domain.hostname,
            domain.verificationToken,
        );

        if (!ok) {
            // Leave it PENDING so the org can fix DNS and retry.
            return { domain, verified: false };
        }

        const verified = await prisma.domain.update({
            where: { id: domain.id },
            data: { status: "VERIFIED", verifiedAt: new Date() },
        });

        // Routing only happens AFTER verification: link the bound Site to this
        // now-controlled hostname.
        if (verified.siteId) {
            await prisma.site.update({
                where: { id: verified.siteId },
                data: { customDomainId: verified.id },
            });
        }

        return { domain: verified, verified: true };
    }

    /** List the org's claimed domains, newest first. Tenant-scoped by ctx. */
    async list(ctx: OrganizationContext) {
        authorize(ctx, "domain:manage");
        return prisma.domain.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
        });
    }

    /**
     * Release a claimed domain. Authorizes `domain:manage`; cross-tenant or
     * missing ids 404. Unlinks it from a routed Site first so no Site is left
     * pointing at a deleted claim.
     */
    async remove(
        ctx: OrganizationContext,
        domainId: string,
    ): Promise<{ id: string; deleted: true }> {
        authorize(ctx, "domain:manage");

        const domain = await this.requireOwned(ctx, domainId);

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
