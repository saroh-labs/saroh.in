// #859: a verified domain is registered with the host (Cloudflare for SaaS),
// a failed call never loses the verification, the next check retries, a
// removal deletes at the host first, and with the env unset hosting is off.
// DB-free: @saroh/database is mocked, the host is a FakeDomainHosting and
// the Cloudflare adapter's fetch is a stub. Nothing touches a network.
jest.mock("@saroh/database", () => {
    const db: Record<string, unknown> = {
        domain: {
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        site: { update: jest.fn(), updateMany: jest.fn() },
        // #917: a check that moves a domain out of live tells the team on
        // the same transaction; one client stands in for both.
        customerNotice: { findFirst: jest.fn().mockResolvedValue(null) },
        job: { create: jest.fn().mockResolvedValue({}) },
    };
    db.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(db));
    return { prisma: db };
});

// A mutable env, so each test chooses whether hosting is set up.
jest.mock("../../env", () => ({ env: {} }));

import {
    Inject,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import type { EntitlementService } from "../billing/entitlement.service";
import type { DomainHosting } from "./domain-hosting";
import { DOMAIN_HOSTING } from "./domain-hosting";
import { HOSTING_WORDS, hostingView } from "./domain-hosting-sync";
import {
    createDomainHosting,
    domainHostingProvider,
} from "./domain-hosting.provider";
import { FakeDomainVerifier } from "./domain-verifier";
import { DomainsService } from "./domains.service";
import {
    CloudflareDomainHosting,
    readHostname,
} from "./providers/cloudflare-hosting";
import { FakeDomainHosting } from "./providers/fake-hosting";

const mutableEnv = env as Record<string, string | undefined>;

const domainFindUnique = prisma.domain.findUnique as jest.Mock;
const domainUpdate = prisma.domain.update as jest.Mock;
const domainDelete = prisma.domain.delete as jest.Mock;
const siteUpdateMany = prisma.site.updateMany as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "ADMIN",
};

function ent(): EntitlementService {
    return {
        can: jest.fn().mockResolvedValue(true),
    } as unknown as EntitlementService;
}

type Row = Record<string, unknown>;

function row(over: Row = {}): Row {
    return {
        id: "dom_1",
        organizationId: "org_1",
        hostname: "shop.acme.com",
        siteId: null,
        status: "PENDING",
        verificationToken: "tok",
        verificationMethod: "DNS_TXT",
        verifiedAt: null,
        lastCheckedAt: null,
        lastCheckResult: null,
        hostingId: null,
        hostingStatus: null,
        hostingError: null,
        hostingCheckedAt: null,
        ...over,
    };
}

/** The row in memory: every update merges into it, as Postgres would. */
function track(initial: Row): { current: Row } {
    const state = { current: initial };
    domainFindUnique.mockImplementation(() => Promise.resolve(state.current));
    domainUpdate.mockImplementation(({ data }: { data: Row }) => {
        state.current = { ...state.current, ...data };
        return Promise.resolve(state.current);
    });
    return state;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    delete mutableEnv.CLOUDFLARE_HOSTNAMES_TOKEN;
    delete mutableEnv.CLOUDFLARE_HOSTNAMES_ZONE_ID;
    delete mutableEnv.CLOUDFLARE_HOSTNAMES_CNAME_TARGET;
});

describe("verify registers the hostname with the host", () => {
    it("registers on the passing check and stores the host's id", async () => {
        const hosting = new FakeDomainHosting();
        const service = new DomainsService(
            new FakeDomainVerifier(true),
            ent(),
            hosting,
        );
        const state = track(row());

        const result = await service.verify(ctx, "dom_1");

        expect(result.verified).toBe(true);
        expect(hosting.calls).toEqual([
            { op: "register", arg: "shop.acme.com" },
        ]);
        expect(state.current).toMatchObject({
            status: "VERIFIED",
            hostingId: "ch_1",
            hostingStatus: "PENDING",
            hostingError: null,
        });
        expect(result.domain.hosting).toMatchObject({
            state: "NOT_POINTED",
            problem: null,
        });
    });

    it("never registers a domain whose TXT check fails", async () => {
        const hosting = new FakeDomainHosting();
        const service = new DomainsService(
            new FakeDomainVerifier(false),
            ent(),
            hosting,
        );
        track(row());

        const result = await service.verify(ctx, "dom_1");

        expect(result.verified).toBe(false);
        expect(hosting.calls).toEqual([]);
        expect(result.domain.hosting.state).toBe("WAITING_VERIFICATION");
    });

    it("a failed call keeps the verification and says what failed", async () => {
        const hosting = new FakeDomainHosting();
        hosting.fail("register", "UNKNOWN");
        const service = new DomainsService(
            new FakeDomainVerifier(true),
            ent(),
            hosting,
        );
        const state = track(row());

        const result = await service.verify(ctx, "dom_1");

        expect(result.verified).toBe(true);
        expect(state.current).toMatchObject({
            status: "VERIFIED",
            hostingId: null,
            hostingStatus: "REGISTER_FAILED",
            hostingError: HOSTING_WORDS.unreachable,
        });
        expect(result.domain.hosting).toMatchObject({
            state: "PROBLEM",
            problem: HOSTING_WORDS.unreachable,
        });
    });

    it("a refusal is told apart from no answer", async () => {
        const hosting = new FakeDomainHosting();
        hosting.fail("register", "REFUSED");
        const service = new DomainsService(
            new FakeDomainVerifier(true),
            ent(),
            hosting,
        );
        const state = track(row());

        await service.verify(ctx, "dom_1");

        expect(state.current.status).toBe("VERIFIED");
        expect(state.current.hostingError).toBe(HOSTING_WORDS.refused);
    });

    it("the next check retries the register without re-checking DNS", async () => {
        const hosting = new FakeDomainHosting();
        const verifier = new FakeDomainVerifier(true);
        const service = new DomainsService(verifier, ent(), hosting);
        const state = track(
            row({
                status: "VERIFIED",
                hostingStatus: "REGISTER_FAILED",
                hostingError: HOSTING_WORDS.unreachable,
            }),
        );

        const result = await service.verify(ctx, "dom_1");

        expect(verifier.calls).toEqual([]);
        expect(hosting.calls).toEqual([
            { op: "register", arg: "shop.acme.com" },
        ]);
        expect(state.current).toMatchObject({
            status: "VERIFIED",
            hostingId: "ch_1",
            hostingStatus: "PENDING",
            hostingError: null,
        });
        expect(result.domain.hosting.state).toBe("NOT_POINTED");
    });

    it("a check on a registered domain refreshes its standing: live", async () => {
        const hosting = new FakeDomainHosting();
        const { id } = await hosting.register("shop.acme.com");
        hosting.set(id, "ACTIVE");
        const service = new DomainsService(
            new FakeDomainVerifier(true),
            ent(),
            hosting,
        );
        track(
            row({
                status: "VERIFIED",
                hostingId: id,
                hostingStatus: "PENDING",
            }),
        );

        const result = await service.verify(ctx, "dom_1");

        expect(result.domain.hosting.state).toBe("LIVE");
        expect(result.domain.hostingId).toBe(id);
    });

    it("names a certificate the host couldn't issue", async () => {
        const hosting = new FakeDomainHosting();
        const { id } = await hosting.register("shop.acme.com");
        hosting.set(id, "FAILED", "CERTIFICATE");
        const service = new DomainsService(
            new FakeDomainVerifier(true),
            ent(),
            hosting,
        );
        track(
            row({
                status: "VERIFIED",
                hostingId: id,
                hostingStatus: "PENDING",
            }),
        );

        const result = await service.verify(ctx, "dom_1");

        expect(result.domain.hosting).toMatchObject({
            state: "PROBLEM",
            problem: HOSTING_WORDS.certificate,
        });
    });

    it("a failed status check keeps the last standing and the verification", async () => {
        const hosting = new FakeDomainHosting();
        const { id } = await hosting.register("shop.acme.com");
        hosting.fail("status");
        const service = new DomainsService(
            new FakeDomainVerifier(true),
            ent(),
            hosting,
        );
        const state = track(
            row({ status: "VERIFIED", hostingId: id, hostingStatus: "ACTIVE" }),
        );

        const result = await service.verify(ctx, "dom_1");

        expect(state.current).toMatchObject({
            status: "VERIFIED",
            hostingId: id,
            hostingStatus: "ACTIVE",
            hostingError: HOSTING_WORDS.checkFailed,
        });
        expect(result.domain.hosting.state).toBe("LIVE");
    });

    it("re-registers a hostname the host no longer has", async () => {
        const hosting = new FakeDomainHosting();
        const service = new DomainsService(
            new FakeDomainVerifier(true),
            ent(),
            hosting,
        );
        const state = track(
            row({
                status: "VERIFIED",
                hostingId: "ch_gone",
                hostingStatus: "ACTIVE",
            }),
        );

        await service.verify(ctx, "dom_1");

        expect(hosting.calls.map((c) => c.op)).toEqual(["status", "register"]);
        expect(state.current).toMatchObject({
            hostingId: "ch_1",
            hostingStatus: "PENDING",
        });
        // It was live: "Check now" tells the team as the run would (#917),
        // and whoever pressed it isn't emailed.
        expect(jobCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                type: "team.alert",
                payload: expect.objectContaining({
                    event: "domain",
                    domainId: "dom_1",
                    change: "down",
                    actorUserId: "user_1",
                }),
            }),
        });
    });
});

describe("remove deletes the hostname at the host first", () => {
    it("asks the host before it unlinks or deletes anything", async () => {
        const hosting = new FakeDomainHosting();
        const { id } = await hosting.register("shop.acme.com");
        const removeSpy = jest.spyOn(hosting, "remove");
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            hosting,
        );
        track(
            row({
                status: "VERIFIED",
                siteId: "site_1",
                hostingId: id,
                hostingStatus: "ACTIVE",
            }),
        );
        domainDelete.mockResolvedValue({});
        siteUpdateMany.mockResolvedValue({ count: 1 });

        await expect(service.remove(ctx, "dom_1")).resolves.toEqual({
            id: "dom_1",
            deleted: true,
        });

        expect(removeSpy).toHaveBeenCalledWith({
            id,
            hostname: "shop.acme.com",
        });
        expect(hosting.hostnames.size).toBe(0);
        const hostOrder = removeSpy.mock.invocationCallOrder[0]!;
        expect(hostOrder).toBeLessThan(
            siteUpdateMany.mock.invocationCallOrder[0]!,
        );
        expect(hostOrder).toBeLessThan(
            domainDelete.mock.invocationCallOrder[0]!,
        );
    });

    it("a failed delete at the host keeps the domain, with a 503 in words", async () => {
        const hosting = new FakeDomainHosting();
        const { id } = await hosting.register("shop.acme.com");
        hosting.fail("remove");
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            hosting,
        );
        track(
            row({
                status: "VERIFIED",
                siteId: "site_1",
                hostingId: id,
                hostingStatus: "ACTIVE",
            }),
        );

        const err = await service.remove(ctx, "dom_1").catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(
            (err as ServiceUnavailableException).getResponse(),
        ).toMatchObject({ details: { reason: "hosting-unavailable" } });
        expect(siteUpdateMany).not.toHaveBeenCalled();
        expect(domainDelete).not.toHaveBeenCalled();
    });

    it("looks a verified domain up by name when no id was stored", async () => {
        const hosting = new FakeDomainHosting();
        await hosting.register("shop.acme.com"); // answer lost: no id on the row
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            hosting,
        );
        track(row({ status: "VERIFIED", hostingStatus: "REGISTER_FAILED" }));
        domainDelete.mockResolvedValue({});

        await service.remove(ctx, "dom_1");

        expect(hosting.hostnames.size).toBe(0);
        expect(domainDelete).toHaveBeenCalled();
    });

    it("never asks the host about a domain that was never verified", async () => {
        const hosting = new FakeDomainHosting();
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            hosting,
        );
        track(row());
        domainDelete.mockResolvedValue({});

        await service.remove(ctx, "dom_1");

        expect(hosting.calls).toEqual([]);
        expect(domainDelete).toHaveBeenCalled();
    });
});

describe("hosting is off when the env is unset", () => {
    it("the provider gives null and warns, naming what is missing", () => {
        const warn = jest.spyOn(Logger.prototype, "warn");
        mutableEnv.CLOUDFLARE_HOSTNAMES_ZONE_ID = "a".repeat(32);

        expect(createDomainHosting()).toBeNull();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("missing=CLOUDFLARE_HOSTNAMES_TOKEN"),
        );
    });

    it("with both set, the provider is the Cloudflare adapter", () => {
        mutableEnv.CLOUDFLARE_HOSTNAMES_TOKEN = fakeToken();
        mutableEnv.CLOUDFLARE_HOSTNAMES_ZONE_ID = "a".repeat(32);

        expect(createDomainHosting()).toBeInstanceOf(CloudflareDomainHosting);
    });

    it("Nest injects the null and the service runs without hosting", async () => {
        @Injectable()
        class Probe {
            constructor(
                @Inject(DOMAIN_HOSTING) readonly hosting: DomainHosting | null,
            ) {}
        }
        const moduleRef = await Test.createTestingModule({
            providers: [domainHostingProvider, Probe],
        }).compile();

        expect(moduleRef.get(Probe).hosting).toBeNull();
    });

    it("verification still works, nothing crashes, and the state says OFF", async () => {
        const warn = jest.spyOn(Logger.prototype, "warn");
        const service = new DomainsService(
            new FakeDomainVerifier(true),
            ent(),
            null,
        );
        const state = track(row());

        const result = await service.verify(ctx, "dom_1");

        expect(result.verified).toBe(true);
        expect(state.current.status).toBe("VERIFIED");
        expect(state.current.hostingId).toBeNull();
        expect(result.domain.hosting).toEqual({
            state: "OFF",
            problem: null,
            checkedAt: null,
            dnsRecord: null,
        });
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("domain_hosting_off_verified"),
        );
    });

    it("removal goes ahead when nothing was ever registered", async () => {
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            null,
        );
        track(row({ status: "VERIFIED" }));
        domainDelete.mockResolvedValue({});

        await service.remove(ctx, "dom_1");

        expect(domainDelete).toHaveBeenCalled();
    });

    it("removal refuses while off if the row says it is registered", async () => {
        const service = new DomainsService(
            new FakeDomainVerifier(),
            ent(),
            null,
        );
        track(row({ status: "VERIFIED", hostingId: "ch_1" }));

        await expect(service.remove(ctx, "dom_1")).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        );
        expect(domainDelete).not.toHaveBeenCalled();
    });
});

describe("hostingView", () => {
    const base = {
        hostname: "shop.acme.com",
        status: "VERIFIED",
        hostingStatus: "PENDING",
        hostingError: null,
        hostingCheckedAt: null,
    };

    it("carries the CNAME to show when the instance names its target", () => {
        mutableEnv.CLOUDFLARE_HOSTNAMES_CNAME_TARGET = "sites.example.com";

        expect(hostingView(base, true).dnsRecord).toEqual({
            type: "CNAME",
            name: "shop.acme.com",
            value: "sites.example.com",
        });
        expect(hostingView(base, false).dnsRecord).toBeNull();
    });
});

/** A token-shaped value built at run time, so no scanner mistakes it for one. */
function fakeToken(): string {
    return ["test", "only", "x".repeat(24)].join("-");
}

describe("CloudflareDomainHosting", () => {
    const zoneId = "b".repeat(32);

    function adapter(answers: { status: number; body: unknown }[]): {
        hosting: CloudflareDomainHosting;
        calls: [string, RequestInit][];
    } {
        const hosting = new CloudflareDomainHosting({
            token: fakeToken(),
            zoneId,
        });
        const calls: [string, RequestInit][] = [];
        hosting.fetchFn = (input, init) => {
            calls.push([String(input), init ?? {}]);
            const next = answers.shift();
            if (!next) return Promise.reject(new Error("no answer"));
            return Promise.resolve(
                new Response(JSON.stringify(next.body), {
                    status: next.status,
                }),
            );
        };
        return { hosting, calls };
    }

    it("registers on the zone with the token as a bearer", async () => {
        const { hosting, calls } = adapter([
            {
                status: 200,
                body: {
                    success: true,
                    result: {
                        id: "ch_9",
                        hostname: "shop.acme.com",
                        status: "pending",
                        ssl: { status: "initializing" },
                    },
                },
            },
        ]);

        await expect(hosting.register("shop.acme.com")).resolves.toEqual({
            id: "ch_9",
            state: "PENDING",
            problem: null,
        });
        const [url, init] = calls[0]!;
        expect(url).toBe(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames`,
        );
        expect(init.method).toBe("POST");
        expect((init.headers as Record<string, string>).authorization).toBe(
            `Bearer ${fakeToken()}`,
        );
        expect(JSON.parse(String(init.body))).toEqual({
            hostname: "shop.acme.com",
            ssl: { method: "http", type: "dv" },
        });
    });

    it("adopts a hostname Cloudflare already has instead of failing", async () => {
        const { hosting } = adapter([
            {
                status: 409,
                body: { success: false, errors: [{ code: 1406 }] },
            },
            {
                status: 200,
                body: {
                    success: true,
                    result: [
                        {
                            id: "ch_7",
                            hostname: "shop.acme.com",
                            status: "active",
                            ssl: { status: "active" },
                        },
                    ],
                },
            },
        ]);

        await expect(hosting.register("shop.acme.com")).resolves.toEqual({
            id: "ch_7",
            state: "ACTIVE",
            problem: null,
        });
    });

    it("a refusal carries the status and codes, never the token or body", async () => {
        const { hosting } = adapter([
            {
                status: 403,
                body: {
                    success: false,
                    errors: [{ code: 10000, message: "Authentication error" }],
                },
            },
            { status: 403, body: { success: false } },
        ]);

        const err = await hosting
            .register("shop.acme.com")
            .catch((e: Error) => e);

        expect(err).toMatchObject({ kind: "REFUSED", status: 403 });
        expect(err.message).not.toContain(fakeToken());
        expect(err.message).not.toContain("Authentication error");
    });

    it("a network failure is UNKNOWN", async () => {
        const { hosting } = adapter([]);

        await expect(hosting.status("ch_1")).rejects.toMatchObject({
            kind: "UNKNOWN",
        });
    });

    it("status of a hostname Cloudflare doesn't have is null", async () => {
        const { hosting } = adapter([
            { status: 404, body: { success: false, errors: [{ code: 1436 }] } },
        ]);

        await expect(hosting.status("ch_1")).resolves.toBeNull();
    });

    it("removing one Cloudflare doesn't have is done", async () => {
        const { hosting, calls } = adapter([
            { status: 404, body: { success: false } },
        ]);

        await expect(
            hosting.remove({ id: "ch_1", hostname: "shop.acme.com" }),
        ).resolves.toBeUndefined();
        expect(calls[0]![1].method).toBe("DELETE");
    });

    it("reads Cloudflare's statuses into where the hostname stands", () => {
        const at = (status: string, ssl: string) =>
            readHostname({
                id: "x",
                hostname: "h",
                status,
                ssl: { status: ssl },
            });
        expect(at("active", "active").state).toBe("ACTIVE");
        expect(at("pending", "pending_validation").state).toBe("PENDING");
        expect(at("active", "pending_deployment").state).toBe("PENDING");
        expect(at("blocked", "active")).toMatchObject({
            state: "FAILED",
            problem: "BLOCKED",
        });
        expect(at("pending", "validation_timed_out")).toMatchObject({
            state: "FAILED",
            problem: "CERTIFICATE",
        });
    });
});
