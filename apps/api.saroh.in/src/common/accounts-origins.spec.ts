import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { hostsFor, urlOf } from "@saroh/edition";

import { env } from "../env";
import { accountsOrigins, fromAccounts } from "./accounts-origins";
import { AccountsOriginGuard } from "./guards/accounts-origin.guard";

/**
 * Which sites may ask for a code (owner, 18 Nov): read from env, never
 * written in the repo. Hosts here come from `@saroh/edition` or are made up.
 */
const india = (environment: "production" | "development") =>
    urlOf(hostsFor("INDIA", environment).accounts);
const global = urlOf(hostsFor("GLOBAL", "production").accounts);
const indiaApi = hostsFor("INDIA", "production").api;
const globalApi = hostsFor("GLOBAL", "production").api;

describe("accountsOrigins", () => {
    it("is ACCOUNTS_URL and each edition's accounts in its environment", () => {
        const origins = accountsOrigins(undefined, {
            ACCOUNTS_URL: `${india("production")}/`,
            NODE_ENV: "production",
        });
        expect(origins).toEqual(
            expect.arrayContaining([india("production"), global]),
        );
        expect(origins).not.toContain(india("development"));
    });

    it("on an edition's own API address, only that edition's accounts", () => {
        const source = {
            ACCOUNTS_URL: india("production"),
            NODE_ENV: "production",
        };
        expect(accountsOrigins(indiaApi, source)).toEqual([
            india("production"),
        ]);
        expect(accountsOrigins(globalApi, source)).toEqual([global]);
    });

    it("finds the environment from BETTER_AUTH_URL when ACCOUNTS_URL is unset", () => {
        expect(
            accountsOrigins(undefined, {
                BETTER_AUTH_URL: urlOf(indiaApi),
                NODE_ENV: "production",
            }),
        ).toEqual(expect.arrayContaining([india("production"), global]));
    });

    it("a stack on ports keeps its own ACCOUNTS_URL whatever API host is asked", () => {
        const source = {
            ACCOUNTS_URL: "http://localhost:3000",
            BETTER_AUTH_URL: "http://localhost:3333",
            NODE_ENV: "test",
        };
        expect(accountsOrigins("localhost:3333", source)).toEqual([
            "http://localhost:3000",
        ]);
    });

    it("in development with nothing set, the local accounts app; elsewhere nothing", () => {
        expect(accountsOrigins(undefined, { NODE_ENV: "development" })).toEqual(
            ["https://accounts.saroh.localhost"],
        );
        expect(accountsOrigins(undefined, { NODE_ENV: "test" })).toEqual([]);
    });
});

describe("fromAccounts and AccountsOriginGuard", () => {
    const before = env.ACCOUNTS_URL;
    beforeAll(() => {
        env.ACCOUNTS_URL = "https://accounts.example.test";
    });
    afterAll(() => {
        env.ACCOUNTS_URL = before;
    });

    const guard = new AccountsOriginGuard();
    const ctx = (headers: Record<string, string>): ExecutionContext =>
        ({
            switchToHttp: () => ({ getRequest: () => ({ headers }) }),
        }) as unknown as ExecutionContext;

    it("lets an accounts Origin through, or its Referer when Origin is absent", () => {
        expect(
            guard.canActivate(ctx({ origin: "https://accounts.example.test" })),
        ).toBe(true);
        expect(
            guard.canActivate(
                ctx({ referer: "https://accounts.example.test/login?x=1" }),
            ),
        ).toBe(true);
    });

    it("refuses another origin, even a Saroh one, and a request with neither header", () => {
        for (const headers of [
            { origin: "https://app.example.test" },
            { origin: "https://accounts.example.test.evil.example" },
            { origin: "null" },
            { referer: "https://evil.example/https://accounts.example.test" },
            {},
        ]) {
            expect(() => guard.canActivate(ctx(headers))).toThrow(
                ForbiddenException,
            );
        }
    });

    it("trusts Origin over Referer", () => {
        expect(
            fromAccounts({
                origin: "https://evil.example",
                referer: "https://accounts.example.test/",
            }),
        ).toBe(false);
    });
});
