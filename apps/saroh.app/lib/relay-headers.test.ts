import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeEnv = vi.hoisted(() => ({
    SITE_RELAY_SECRET: "a-test-secret-a-test-secret-a-test-secret",
    NODE_ENV: "production",
    NEXT_PUBLIC_VERCEL_ENV: "production",
}));
vi.mock("@/env", () => ({ env: fakeEnv }));
vi.mock("next/headers", () => ({
    headers: () => {
        throw new Error("outside a request");
    },
}));

import { withRelay, withRelayFrom } from "./relay-headers";
import { SITE_RELAY_HEADER } from "./site-relay";

const visitor = (extra: Record<string, string> = {}) =>
    new Headers({
        host: "rye.saroh.app",
        "x-real-ip": "203.0.113.7",
        ...extra,
    });

describe("withRelayFrom — pay calls count the visitor", () => {
    beforeEach(() => {
        fakeEnv.SITE_RELAY_SECRET = "a-test-secret-a-test-secret-a-test-secret";
    });

    it("adds the signed relay when the visitor's address is known", () => {
        const sent = withRelayFrom(visitor(), { accept: "application/json" });
        expect(sent.accept).toBe("application/json");
        expect(sent[SITE_RELAY_HEADER]).toMatch(/^v1\./);
    });

    it("goes unsigned, never failing, without a secret", () => {
        fakeEnv.SITE_RELAY_SECRET = undefined;
        const sent = withRelayFrom(visitor(), { accept: "application/json" });
        expect(sent).toEqual({ accept: "application/json" });
    });

    it("goes unsigned when the visitor's address is unknown", () => {
        const sent = withRelayFrom(new Headers({ host: "rye.saroh.app" }), {
            accept: "application/pdf",
        });
        expect(sent).toEqual({ accept: "application/pdf" });
    });

    it("outside a request, sends the headers it was given", async () => {
        await expect(
            withRelay({ accept: "application/json" }),
        ).resolves.toEqual({
            accept: "application/json",
        });
    });
});
