// #861: the test-only DOMAIN_HOSTING_FAKE switch, which lets the browser-test
// stack verify a domain and see every hosting state without DNS or
// Cloudflare. It is honoured only in a test run and never in production;
// the fake verifier passes `.example.com` alone; the fake hosting puts a
// hostname in the state its first label names. Nothing touches a network.
jest.mock("@saroh/database", () => ({ prisma: {} }));

// A mutable env, so each test chooses the switch and the run's marks.
jest.mock("../../env", () => ({ env: {}, declaredNodeEnv: undefined }));

import { Logger } from "@nestjs/common";

import { domainFakesAllowed } from "./domain-fakes";
import { createDomainHosting } from "./domain-hosting.provider";
import type { DomainVerifier } from "./domain-verifier";
import {
    createDomainVerifier,
    DnsTxtDomainVerifier,
    ExampleDomainVerifier,
    FakeDomainVerifier,
} from "./domain-verifier";
import { CloudflareDomainHosting } from "./providers/cloudflare-hosting";
import { FakeDomainHosting, stateFromLabel } from "./providers/fake-hosting";

const mutableModule = jest.requireMock<{
    env: Record<string, string | undefined>;
    declaredNodeEnv: string | undefined;
}>("../../env");
const mutableEnv = mutableModule.env;

beforeEach(() => {
    for (const key of Object.keys(mutableEnv)) delete mutableEnv[key];
    mutableModule.declaredNodeEnv = undefined;
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe("DOMAIN_HOSTING_FAKE: only in a test run", () => {
    it("is on for `1` under Jest or on the CI browser stack", () => {
        expect(domainFakesAllowed("1", { nodeEnvs: ["test", "test"] })).toBe(
            true,
        );
        expect(
            domainFakesAllowed("1", {
                nodeEnvs: [undefined, undefined],
                ci: "1",
            }),
        ).toBe(true);
        expect(
            domainFakesAllowed("1", {
                nodeEnvs: [undefined, undefined],
                ci: "true",
            }),
        ).toBe(true);
    });

    it("is off under a declared production, whatever else is set", () => {
        expect(
            domainFakesAllowed("1", {
                nodeEnvs: ["production", "production"],
                ci: "true",
            }),
        ).toBe(false);
        // SKIP_ENV_VALIDATION hands env.NODE_ENV through untouched.
        expect(
            domainFakesAllowed("1", {
                nodeEnvs: [undefined, "production"],
                ci: "1",
            }),
        ).toBe(false);
    });

    it("is off on a host that isn't a test run, or without the switch", () => {
        expect(
            domainFakesAllowed("1", {
                nodeEnvs: ["development", "development"],
            }),
        ).toBe(false);
        expect(
            domainFakesAllowed("1", {
                nodeEnvs: [undefined, "development"],
                ci: "false",
            }),
        ).toBe(false);
        expect(
            domainFakesAllowed(undefined, {
                nodeEnvs: ["test", "test"],
                ci: "1",
            }),
        ).toBe(false);
    });

    it("binds the fakes in a test run, over Cloudflare's settings", () => {
        mutableEnv.DOMAIN_HOSTING_FAKE = "1";
        mutableEnv.CI = "1";
        mutableEnv.CLOUDFLARE_HOSTNAMES_TOKEN = "t".repeat(40);
        mutableEnv.CLOUDFLARE_HOSTNAMES_ZONE_ID = "a".repeat(32);

        expect(createDomainHosting()).toBeInstanceOf(FakeDomainHosting);
        expect(createDomainVerifier()).toBeInstanceOf(ExampleDomainVerifier);
    });

    it("binds the real ones under a declared production", () => {
        mutableEnv.DOMAIN_HOSTING_FAKE = "1";
        mutableEnv.CI = "1";
        mutableEnv.NODE_ENV = "production";
        mutableModule.declaredNodeEnv = "production";
        mutableEnv.CLOUDFLARE_HOSTNAMES_TOKEN = "t".repeat(40);
        mutableEnv.CLOUDFLARE_HOSTNAMES_ZONE_ID = "a".repeat(32);

        expect(createDomainHosting()).toBeInstanceOf(CloudflareDomainHosting);
        expect(createDomainVerifier()).toBeInstanceOf(DnsTxtDomainVerifier);
    });

    it("binds the real ones outside a test run", () => {
        mutableEnv.DOMAIN_HOSTING_FAKE = "1";
        mutableModule.declaredNodeEnv = "development";

        expect(createDomainHosting()).toBeNull();
        expect(createDomainVerifier()).toBeInstanceOf(DnsTxtDomainVerifier);
    });
});

describe("the fake hosting: the first label names the state", () => {
    it("live-… is ACTIVE, problem-… FAILED, anything else PENDING", () => {
        expect(stateFromLabel("live-desk-1.example.com")).toEqual({
            state: "ACTIVE",
            problem: null,
        });
        expect(stateFromLabel("problem-desk-1.example.com")).toEqual({
            state: "FAILED",
            problem: "CERTIFICATE",
        });
        expect(stateFromLabel("pending-desk-1.example.com")).toEqual({
            state: "PENDING",
            problem: null,
        });
        // Only the first label counts, and only as a prefix.
        expect(stateFromLabel("shop.live-x.example.com").state).toBe("PENDING");
        expect(stateFromLabel("alive-x.example.com").state).toBe("PENDING");
        expect(stateFromLabel("live.example.com").state).toBe("PENDING");
    });

    it("registers in that state, and reads it back by id", async () => {
        const hosting = new FakeDomainHosting({ byLabel: true });
        const live = await hosting.register("live-a.example.com");
        const problem = await hosting.register("problem-a.example.com");
        const pending = await hosting.register("www.example.com");

        expect(live).toMatchObject({ state: "ACTIVE", problem: null });
        expect(problem).toMatchObject({
            state: "FAILED",
            problem: "CERTIFICATE",
        });
        expect(pending).toMatchObject({ state: "PENDING", problem: null });
        expect(await hosting.status(live.id)).toEqual(live);

        await hosting.remove({ id: live.id, hostname: "live-a.example.com" });
        expect(await hosting.status(live.id)).toBeNull();
    });

    it("without byLabel, every hostname still starts PENDING", async () => {
        const hosting = new FakeDomainHosting();
        expect((await hosting.register("live-a.example.com")).state).toBe(
            "PENDING",
        );
    });
});

describe("the fake verifier: .example.com only", () => {
    function fallback(): DomainVerifier & { calls: unknown[] } {
        return new FakeDomainVerifier(false);
    }

    it("passes a hostname under .example.com without asking DNS", async () => {
        const dns = fallback();
        const verifier = new ExampleDomainVerifier(dns);

        await expect(
            verifier.verify("live-a.example.com", "token"),
        ).resolves.toEqual({ ok: true });
        await expect(
            verifier.verify("Shop.Example.COM", "token"),
        ).resolves.toEqual({ ok: true });
        expect(dns.calls).toHaveLength(0);
    });

    it("sends every other hostname to DNS, as without the switch", async () => {
        const dns = fallback();
        const verifier = new ExampleDomainVerifier(dns);

        for (const hostname of [
            "northwindsupply.in",
            "example.com",
            "shop.example.com.evil.in",
            "notexample.com",
        ]) {
            await expect(verifier.verify(hostname, "token")).resolves.toEqual({
                ok: false,
                reason: "NO_RECORD",
            });
        }
        expect(dns.calls).toHaveLength(4);
    });
});
