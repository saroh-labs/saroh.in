// DB-free unit tests: the database package is mocked so nothing touches a real
// Postgres, and the DomainVerifier port is a FakeDomainVerifier so nothing
// touches DNS or the network.
jest.mock("@saroh/database", () => {
    return {
        prisma: {
            domain: {
                create: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            site: {
                findUnique: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn(),
            },
        },
    };
});

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { FakeDomainVerifier, verificationRecordName } from "./domain-verifier";
import { DomainsService } from "./domains.service";

/**
 * EntitlementService stub. `can` resolves true by default so the existing claim
 * tests (which predate the paid-plan gate) still succeed; the dedicated gate
 * test overrides it to false.
 */
const entCan = jest.fn().mockResolvedValue(true);
function ent(): EntitlementService {
    return {
        can: entCan,
        check: jest.fn().mockResolvedValue(true),
        getEntitlements: jest.fn(),
    } as unknown as EntitlementService;
}

const domainCreate = prisma.domain.create as jest.Mock;
const domainFindUnique = prisma.domain.findUnique as jest.Mock;
const domainFindMany = prisma.domain.findMany as jest.Mock;
const domainUpdate = prisma.domain.update as jest.Mock;
const domainDelete = prisma.domain.delete as jest.Mock;
const siteFindUnique = prisma.site.findUnique as jest.Mock;
const siteUpdate = prisma.site.update as jest.Mock;
const siteUpdateMany = prisma.site.updateMany as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

describe("DomainsService.claim", () => {
    beforeEach(() => jest.clearAllMocks());

    it("creates a PENDING domain with a token scoped to the ctx org and returns TXT instructions", async () => {
        const service = new DomainsService(new FakeDomainVerifier(), ent());
        domainFindUnique.mockResolvedValue(null); // hostname free
        domainCreate.mockImplementation(
            ({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: "dom_1", ...data }),
        );

        const { domain, dnsRecord } = await service.claim(ctx(), {
            hostname: "Shop.Acme.com",
        });

        // Persisted PENDING, scoped to the ctx org, with a random token.
        expect(domainCreate).toHaveBeenCalledTimes(1);
        const data = domainCreate.mock.calls[0][0].data;
        expect(data).toMatchObject({
            organizationId: "org_1",
            hostname: "shop.acme.com", // normalized lower-case
            status: "PENDING",
            verificationMethod: "DNS_TXT",
            siteId: null,
        });
        expect(typeof data.verificationToken).toBe("string");
        expect(data.verificationToken.length).toBeGreaterThan(0);

        // TXT record instructions point at the dedicated verification host.
        expect(dnsRecord).toEqual({
            type: "TXT",
            name: verificationRecordName("shop.acme.com"),
            value: domain.verificationToken,
        });
    });

    it("rejects an already-claimed hostname with 409 Conflict and never creates", async () => {
        const service = new DomainsService(new FakeDomainVerifier(), ent());
        // Claimed by ANOTHER org — still blocks (hostname is globally unique).
        domainFindUnique.mockResolvedValue({
            id: "dom_x",
            organizationId: "org_OTHER",
            hostname: "shop.acme.com",
        });

        await expect(
            service.claim(ctx(), { hostname: "shop.acme.com" }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(domainCreate).not.toHaveBeenCalled();
    });

    it("validates the bound Site belongs to the org (cross-tenant siteId → 404)", async () => {
        const service = new DomainsService(new FakeDomainVerifier(), ent());
        domainFindUnique.mockResolvedValue(null);
        siteFindUnique.mockResolvedValue({
            id: "site_1",
            organizationId: "org_OTHER",
        });

        await expect(
            service.claim(ctx(), {
                hostname: "shop.acme.com",
                siteId: "site_1",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(domainCreate).not.toHaveBeenCalled();
    });

    it("denies a MEMBER (domain:manage is OWNER/ADMIN-only) before any I/O", async () => {
        const service = new DomainsService(new FakeDomainVerifier(), ent());

        await expect(
            service.claim(ctx({ role: "MEMBER" }), {
                hostname: "shop.acme.com",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(domainFindUnique).not.toHaveBeenCalled();
        expect(domainCreate).not.toHaveBeenCalled();
    });

    it("refuses the claim when the plan lacks the customDomain entitlement (FREE default), no write", async () => {
        const service = new DomainsService(new FakeDomainVerifier(), ent());
        entCan.mockResolvedValueOnce(false); // FREE plan: customDomain is false
        domainFindUnique.mockResolvedValue(null); // hostname is otherwise free

        await expect(
            service.claim(ctx(), { hostname: "shop.acme.com" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(entCan).toHaveBeenCalledWith("org_1", "customDomain");
        expect(domainCreate).not.toHaveBeenCalled();
    });
});

describe("DomainsService.verify", () => {
    beforeEach(() => jest.clearAllMocks());

    it("flips PENDING → VERIFIED via the verifier and links the bound Site", async () => {
        const verifier = new FakeDomainVerifier(true); // DNS check passes
        const service = new DomainsService(verifier, ent());
        domainFindUnique.mockResolvedValue({
            id: "dom_1",
            organizationId: "org_1",
            hostname: "shop.acme.com",
            verificationToken: "tok_abc",
            status: "PENDING",
            siteId: "site_1",
        });
        domainUpdate.mockResolvedValue({
            id: "dom_1",
            organizationId: "org_1",
            hostname: "shop.acme.com",
            verificationToken: "tok_abc",
            status: "VERIFIED",
            siteId: "site_1",
        });
        siteUpdate.mockResolvedValue({ id: "site_1" });

        const res = await service.verify(ctx(), "dom_1");

        // The verifier was asked to check the real hostname + token.
        expect(verifier.calls).toEqual([
            { hostname: "shop.acme.com", expectedToken: "tok_abc" },
        ]);
        expect(domainUpdate).toHaveBeenCalledWith({
            where: { id: "dom_1" },
            data: expect.objectContaining({ status: "VERIFIED" }),
        });
        // Routing/link happens ONLY after verification.
        expect(siteUpdate).toHaveBeenCalledWith({
            where: { id: "site_1" },
            data: { customDomainId: "dom_1" },
        });
        expect(res).toEqual({
            domain: expect.objectContaining({ status: "VERIFIED" }),
            verified: true,
        });
    });

    it("leaves the domain PENDING and unlinked when the verifier fails", async () => {
        const verifier = new FakeDomainVerifier(false); // DNS check fails
        const service = new DomainsService(verifier, ent());
        domainFindUnique.mockResolvedValue({
            id: "dom_1",
            organizationId: "org_1",
            hostname: "shop.acme.com",
            verificationToken: "tok_abc",
            status: "PENDING",
            siteId: "site_1",
        });

        domainUpdate.mockImplementation(({ data }) =>
            Promise.resolve({
                id: "dom_1",
                organizationId: "org_1",
                hostname: "shop.acme.com",
                verificationToken: "tok_abc",
                status: "PENDING",
                siteId: "site_1",
                ...data,
            }),
        );

        const res = await service.verify(ctx(), "dom_1");

        // Still PENDING, still unlinked — and the attempt is RECORDED (#200):
        // when it ran and why it failed, so the screen can say so.
        expect(res).toEqual({
            domain: expect.objectContaining({
                status: "PENDING",
                lastCheckResult: "NO_RECORD",
            }),
            verified: false,
            reason: "NO_RECORD",
        });
        expect(domainUpdate).toHaveBeenCalledWith({
            where: { id: "dom_1" },
            data: {
                lastCheckedAt: expect.any(Date),
                lastCheckResult: "NO_RECORD",
            },
        });
        expect(siteUpdate).not.toHaveBeenCalled();
    });

    it("names a wrong value and a failed lookup as different failures (#200)", async () => {
        const verifier = new FakeDomainVerifier(false);
        const service = new DomainsService(verifier, ent());
        domainFindUnique.mockResolvedValue({
            id: "dom_1",
            organizationId: "org_1",
            hostname: "shop.acme.com",
            verificationToken: "tok_abc",
            status: "PENDING",
            siteId: null,
        });
        domainUpdate.mockImplementation(({ data }) =>
            Promise.resolve({ id: "dom_1", status: "PENDING", ...data }),
        );

        verifier.setFailure("WRONG_VALUE");
        expect((await service.verify(ctx(), "dom_1")).reason).toBe(
            "WRONG_VALUE",
        );
        verifier.setFailure("LOOKUP_FAILED");
        expect((await service.verify(ctx(), "dom_1")).reason).toBe(
            "LOOKUP_FAILED",
        );
        expect(
            domainUpdate.mock.calls.map((c) => c[0].data.lastCheckResult),
        ).toEqual(["WRONG_VALUE", "LOOKUP_FAILED"]);
    });

    it("is idempotent: an already-VERIFIED domain is returned without re-checking DNS", async () => {
        const verifier = new FakeDomainVerifier(true);
        const service = new DomainsService(verifier, ent());
        domainFindUnique.mockResolvedValue({
            id: "dom_1",
            organizationId: "org_1",
            hostname: "shop.acme.com",
            verificationToken: "tok_abc",
            status: "VERIFIED",
            siteId: "site_1",
        });

        const res = await service.verify(ctx(), "dom_1");

        expect(res.verified).toBe(true);
        expect(verifier.calls).toHaveLength(0);
        expect(domainUpdate).not.toHaveBeenCalled();
    });

    it("rejects a cross-tenant verify with 404 and never checks DNS", async () => {
        const verifier = new FakeDomainVerifier(true);
        const service = new DomainsService(verifier, ent());
        domainFindUnique.mockResolvedValue({
            id: "dom_1",
            organizationId: "org_OTHER",
            hostname: "shop.acme.com",
            verificationToken: "tok_abc",
            status: "PENDING",
        });

        await expect(service.verify(ctx(), "dom_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(verifier.calls).toHaveLength(0);
        expect(domainUpdate).not.toHaveBeenCalled();
    });

    it("denies a MEMBER before loading anything", async () => {
        const service = new DomainsService(new FakeDomainVerifier(true), ent());
        await expect(
            service.verify(ctx({ role: "MEMBER" }), "dom_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(domainFindUnique).not.toHaveBeenCalled();
    });
});

describe("DomainsService.list", () => {
    beforeEach(() => jest.clearAllMocks());

    it("scopes the query to the ctx org, newest first", async () => {
        const service = new DomainsService(new FakeDomainVerifier(), ent());
        domainFindMany.mockResolvedValue([
            {
                id: "dom_1",
                hostname: "shop.acme.com",
                verificationToken: "tok_abc",
                status: "PENDING",
            },
        ]);

        const listed = await service.list(ctx());

        // Each row carries the record to publish (#200), derived once here.
        expect(listed[0].dnsRecord).toEqual({
            type: "TXT",
            name: verificationRecordName("shop.acme.com"),
            value: "tok_abc",
        });

        expect(domainFindMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            orderBy: { createdAt: "desc" },
        });
    });
});

describe("DomainsService.remove", () => {
    beforeEach(() => jest.clearAllMocks());

    it("unlinks the routed Site then deletes an owned domain", async () => {
        const service = new DomainsService(new FakeDomainVerifier(), ent());
        domainFindUnique.mockResolvedValue({
            id: "dom_1",
            organizationId: "org_1",
            hostname: "shop.acme.com",
            siteId: "site_1",
        });
        siteUpdateMany.mockResolvedValue({ count: 1 });
        domainDelete.mockResolvedValue({ id: "dom_1" });

        const res = await service.remove(ctx(), "dom_1");

        expect(siteUpdateMany).toHaveBeenCalledWith({
            where: { id: "site_1", customDomainId: "dom_1" },
            data: { customDomainId: null },
        });
        expect(domainDelete).toHaveBeenCalledWith({ where: { id: "dom_1" } });
        expect(res).toEqual({ id: "dom_1", deleted: true });
    });

    it("rejects a cross-tenant remove with 404 and deletes nothing", async () => {
        const service = new DomainsService(new FakeDomainVerifier(), ent());
        domainFindUnique.mockResolvedValue({
            id: "dom_1",
            organizationId: "org_OTHER",
            hostname: "shop.acme.com",
        });

        await expect(service.remove(ctx(), "dom_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(domainDelete).not.toHaveBeenCalled();
    });
});
