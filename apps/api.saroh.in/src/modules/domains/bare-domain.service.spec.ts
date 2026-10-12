// DEC-140 in the service: a bare domain is connected through `www`, kept as
// it is when its DNS already reaches the hosting, and the check of a
// verified `www` domain records where its bare domain stands. DB-free:
// @saroh/database is mocked, DNS and the network are a FakeBareDomainCheck.
jest.mock("@saroh/database", () => ({
    prisma: {
        domain: {
            create: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
        },
        site: { findUnique: jest.fn(), update: jest.fn() },
    },
}));

jest.mock("../../env", () => ({ env: {}, declaredNodeEnv: undefined }));

import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Domain } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import {
    BareLookBudget,
    bareRead,
    hostnameToConnect,
    syncBareDomain,
} from "./bare-domain-sync";
import { FakeBareDomainCheck } from "./bare-forwarding";
import { DomainRecheckHandler } from "./domain-recheck.handler";
import { FakeDomainVerifier } from "./domain-verifier";
import { DomainsService } from "./domains.service";
import { FakeDomainHosting } from "./providers/fake-hosting";

const create = prisma.domain.create as jest.Mock;
const findUnique = prisma.domain.findUnique as jest.Mock;
const findMany = prisma.domain.findMany as jest.Mock;
const update = prisma.domain.update as jest.Mock;

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "ADMIN",
} as OrganizationContext;

function ent(): EntitlementService {
    return {
        can: jest.fn().mockResolvedValue(true),
    } as unknown as EntitlementService;
}

function row(over: Partial<Domain> = {}): Domain {
    return {
        id: "dom_1",
        organizationId: "org_1",
        hostname: "www.example.co.in",
        siteId: null,
        status: "VERIFIED",
        verificationToken: "tok",
        verificationMethod: "DNS_TXT",
        verifiedAt: new Date("2026-10-01T00:00:00.000Z"),
        lastCheckedAt: null,
        lastCheckResult: null,
        hostingId: null,
        hostingStatus: null,
        hostingError: null,
        hostingCheckedAt: null,
        bareStatus: null,
        bareCheckedAt: null,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
        ...over,
    } as Domain;
}

/** The row as the last write left it, as Prisma's update answers. */
function updatesApplyTo(start: Domain): void {
    let current = start;
    update.mockImplementation(({ data }: { data: Partial<Domain> }) => {
        current = { ...current, ...data };
        return Promise.resolve(current);
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue(null);
    findMany.mockResolvedValue([]);
    create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
            row({
                id: "dom_new",
                ...(data as Partial<Domain>),
                verifiedAt: null,
            }),
        ),
    );
});

describe("hostnameToConnect", () => {
    it("connects a bare domain as its www", async () => {
        const check = new FakeBareDomainCheck();
        await expect(hostnameToConnect("example.co.in", check)).resolves.toBe(
            "www.example.co.in",
        );
    });

    it("keeps a bare domain whose DNS already reaches the hosting", async () => {
        const check = new FakeBareDomainCheck();
        check.setPointsHere("example.co.in");
        await expect(hostnameToConnect("example.co.in", check)).resolves.toBe(
            "example.co.in",
        );
    });

    it("keeps www and any other subdomain, without looking at DNS", async () => {
        const check = new FakeBareDomainCheck();
        await expect(
            hostnameToConnect("www.example.co.in", check),
        ).resolves.toBe("www.example.co.in");
        await expect(
            hostnameToConnect("shop.example.co.in", check),
        ).resolves.toBe("shop.example.co.in");
        expect(check.calls).toEqual([]);
    });

    it("connects through www where the check is off", async () => {
        await expect(hostnameToConnect("example.com", null)).resolves.toBe(
            "www.example.com",
        );
    });
});

describe("DomainsService.claim with a bare domain", () => {
    it("claims www.<domain> and says the bare domain forwards to it", async () => {
        const check = new FakeBareDomainCheck();
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            null,
            check,
        );

        const res = await service.claim(ctx, { hostname: "Example.co.in" });

        expect(create.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_1",
            hostname: "www.example.co.in",
            status: "PENDING",
        });
        expect(res.domain.hostname).toBe("www.example.co.in");
        expect(res.domain.hostnameKind).toBe("www");
        expect(res.domain.bare).toEqual({
            hostname: "example.co.in",
            forwardTo: "https://www.example.co.in",
            state: null,
            checkedAt: null,
            added: false,
        });
        // The record to add proves the www address, the one that was claimed.
        expect(res.dnsRecord.name).toBe(
            "_saroh-verification.www.example.co.in",
        );
    });

    it("keeps the bare domain itself when its DNS already reaches the hosting", async () => {
        const check = new FakeBareDomainCheck();
        check.setPointsHere("example.co.in");
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            null,
            check,
        );

        const res = await service.claim(ctx, { hostname: "example.co.in" });

        expect(create.mock.calls[0][0].data.hostname).toBe("example.co.in");
        expect(res.domain.hostnameKind).toBe("bare");
        expect(res.domain.bare).toBeNull();
    });

    it("leaves a subdomain as it was typed, with no forwarding", async () => {
        const check = new FakeBareDomainCheck();
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            null,
            check,
        );

        const res = await service.claim(ctx, { hostname: "shop.example.com" });

        expect(create.mock.calls[0][0].data.hostname).toBe("shop.example.com");
        expect(res.domain.hostnameKind).toBe("subdomain");
        expect(res.domain.bare).toBeNull();
        expect(check.calls).toEqual([]);
    });

    it("refuses a bare domain whose www is already claimed, naming www", async () => {
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            null,
            new FakeBareDomainCheck(),
        );
        findUnique.mockResolvedValue(row());

        await expect(
            service.claim(ctx, { hostname: "example.co.in" }),
        ).rejects.toThrow(
            new ConflictException(
                'Hostname "www.example.co.in" is already claimed',
            ),
        );
        expect(findUnique).toHaveBeenCalledWith({
            where: { hostname: "www.example.co.in" },
        });
        expect(create).not.toHaveBeenCalled();
    });

    it("still refuses a test-release host before anything else", async () => {
        const check = new FakeBareDomainCheck();
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            null,
            check,
        );
        await expect(
            service.claim(ctx, { hostname: "test.example.com" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(check.calls).toEqual([]);
    });
});

describe("the check of a verified www domain", () => {
    it("records where the bare domain stands, beside the hosting", async () => {
        const hosting = new FakeDomainHosting();
        const check = new FakeBareDomainCheck();
        check.setStatus("example.co.in", "FORWARDS_HTTP_ONLY");
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            hosting,
            check,
        );
        const domain = row();
        updatesApplyTo(domain);

        const { domain: after, verified } = await service.check(domain);

        expect(verified).toBe(true);
        expect(after.bareStatus).toBe("FORWARDS_HTTP_ONLY");
        expect(after.bareCheckedAt).toBeInstanceOf(Date);
        // The hosting write is its own: the bare domain never touches it.
        expect(after.hostingStatus).toBe("PENDING");
        expect(update).toHaveBeenLastCalledWith({
            where: { id: "dom_1" },
            data: {
                bareStatus: "FORWARDS_HTTP_ONLY",
                bareCheckedAt: expect.any(Date),
            },
        });
    });

    it("leaves a live www domain live when its bare domain doesn't forward", async () => {
        const hosting = new FakeDomainHosting();
        const registered = await hosting.register("www.example.co.in");
        hosting.set(registered.id, "ACTIVE");
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            hosting,
            new FakeBareDomainCheck(),
        );
        const domain = row({
            hostingId: registered.id,
            hostingStatus: "ACTIVE",
        });
        updatesApplyTo(domain);

        const { domain: after } = await service.check(domain);

        expect(after.status).toBe("VERIFIED");
        expect(after.hostingStatus).toBe("ACTIVE");
        expect(after.hostingError).toBeNull();
        expect(after.bareStatus).toBe("NOT_FORWARDING");
    });

    it("looks at the bare domain as soon as the TXT check passes", async () => {
        const check = new FakeBareDomainCheck();
        check.setStatus("example.co.in", "FORWARDS");
        const service = new DomainsService(
            new FakeDomainVerifier(true),
            ent(),
            null,
            check,
        );
        const domain = row({ status: "PENDING", verifiedAt: null });
        updatesApplyTo(domain);

        const { domain: after } = await service.check(domain);

        expect(after.status).toBe("VERIFIED");
        expect(after.bareStatus).toBe("FORWARDS");
    });

    it("looks at nothing for a claim that hasn't verified", async () => {
        const check = new FakeBareDomainCheck();
        const service = new DomainsService(
            new FakeDomainVerifier(false),
            ent(),
            null,
            check,
        );
        const domain = row({ status: "PENDING", verifiedAt: null });
        updatesApplyTo(domain);

        const { domain: after } = await service.check(domain);

        expect(after.bareStatus).toBeNull();
        expect(check.calls).toEqual([]);
    });
});

describe("the background re-check (#860)", () => {
    it("says when a live www domain's bare domain has stopped forwarding", async () => {
        const hosting = new FakeDomainHosting();
        const registered = await hosting.register("www.example.co.in");
        hosting.set(registered.id, "ACTIVE");
        const check = new FakeBareDomainCheck();
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            hosting,
            check,
        );
        const handler = new DomainRecheckHandler(service, hosting);
        const now = new Date("2026-10-12T10:00:00.000Z");
        // Live, forwarding, and last looked at over a day ago: due.
        const domain = row({
            hostingId: registered.id,
            hostingStatus: "ACTIVE",
            hostingCheckedAt: new Date("2026-10-11T09:00:00.000Z"),
            bareStatus: "FORWARDS",
            bareCheckedAt: new Date("2026-10-11T09:00:00.000Z"),
        });
        findMany.mockResolvedValueOnce([domain]).mockResolvedValueOnce([]);
        updatesApplyTo(domain);

        const summary = await handler.sweep(now);

        // A notice on the row: the domain did not go down, and nothing failed.
        expect(summary).toEqual({
            checked: 1,
            failed: 0,
            hostBackedOff: false,
            wentDown: 0,
        });
        expect(check.calls).toEqual([
            { op: "forwarding", bare: "example.co.in" },
        ]);
        expect(update).toHaveBeenLastCalledWith({
            where: { id: "dom_1" },
            data: {
                bareStatus: "NOT_FORWARDING",
                bareCheckedAt: expect.any(Date),
            },
        });
    });
});

describe("syncBareDomain", () => {
    it("leaves a subdomain and a bare domain's own row alone", async () => {
        const check = new FakeBareDomainCheck();
        const shop = row({ hostname: "shop.example.co.in" });
        const bare = row({ hostname: "example.co.in" });
        await expect(syncBareDomain(check, shop)).resolves.toBe(shop);
        await expect(syncBareDomain(check, bare)).resolves.toBe(bare);
        expect(check.calls).toEqual([]);
        expect(update).not.toHaveBeenCalled();
    });

    it("leaves the row as it was where the check is off", async () => {
        const domain = row();
        await expect(syncBareDomain(null, domain)).resolves.toBe(domain);
        expect(update).not.toHaveBeenCalled();
    });

    it("keeps the last standing when the look throws", async () => {
        const domain = row({ bareStatus: "FORWARDS" });
        const broken = {
            pointsHere: () => Promise.resolve(false),
            forwarding: () => Promise.reject(new Error("boom")),
        };
        await expect(syncBareDomain(broken, domain)).resolves.toBe(domain);
        expect(update).not.toHaveBeenCalled();
    });
});

describe("the background's time for bare domains", () => {
    it("skips a look once the window's time is spent, and keeps the last standing", async () => {
        const check = new FakeBareDomainCheck();
        check.setStatus("example.co.in", "NOT_FORWARDING");
        const budget = new BareLookBudget(1_000, 60_000);
        budget.has();
        budget.spend(1_000);
        const domain = row({ bareStatus: "FORWARDS" });

        await expect(syncBareDomain(check, domain, budget)).resolves.toBe(
            domain,
        );
        expect(check.calls).toEqual([]);
        expect(update).not.toHaveBeenCalled();
    });

    it("has its time back when the window turns", () => {
        const budget = new BareLookBudget(1_000, 60_000);
        expect(budget.has(10_000)).toBe(true);
        budget.spend(1_500);
        expect(budget.has(20_000)).toBe(false);
        expect(budget.has(70_000)).toBe(true);
    });

    it("never skips a look somebody asked for", async () => {
        const check = new FakeBareDomainCheck();
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            null,
            check,
        );
        const spent = (service as unknown as { bareBudget: BareLookBudget })
            .bareBudget;
        spent.has();
        spent.spend(10 * 60_000);
        const domain = row();
        updatesApplyTo(domain);

        // The re-check job: skipped.
        expect((await service.check(domain)).domain.bareStatus).toBeNull();
        // "Check now": looked at.
        expect((await service.check(domain, "user_1")).domain.bareStatus).toBe(
            "NOT_FORWARDING",
        );
    });
});

describe("the read's bare-domain part", () => {
    it("says the business added the bare domain too, from its own domains only", async () => {
        const service = new DomainsService(new FakeDomainVerifier(), ent());
        findMany.mockResolvedValue([
            row({ id: "dom_www", bareStatus: "POINTS_HERE" }),
            row({ id: "dom_bare", hostname: "example.co.in" }),
            row({ id: "dom_shop", hostname: "shop.other.in" }),
        ]);

        const list = await service.list(ctx);

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: "org_1" } }),
        );
        expect(list.map((d) => [d.hostname, d.hostnameKind])).toEqual([
            ["www.example.co.in", "www"],
            ["example.co.in", "bare"],
            ["shop.other.in", "subdomain"],
        ]);
        expect(list[0]?.bare).toMatchObject({
            hostname: "example.co.in",
            state: "POINTS_HERE",
            added: true,
        });
        expect(list[1]?.bare).toBeNull();
    });

    it("asks only this business's rows whether the bare domain was added", async () => {
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            null,
            new FakeBareDomainCheck(),
        );
        findUnique.mockResolvedValue(row());
        updatesApplyTo(row());

        await service.verify(ctx, "dom_1");

        expect(findMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                hostname: { in: ["example.co.in"] },
            },
            select: { hostname: true },
        });
    });

    it("reads a status it doesn't know as not checked", () => {
        expect(
            bareRead(row({ bareStatus: "SOMETHING_NEW" }), new Set<string>())
                .bare?.state,
        ).toBeNull();
    });
});
