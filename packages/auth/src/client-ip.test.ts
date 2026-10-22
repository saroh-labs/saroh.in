import { getIp } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authOptions } from "./server";

/** Cloudflare's 172.64.0.0/13 and a private network, as the API passes them. */
const PROXIES = ["172.64.0.0/13", "10.0.0.0/8"];

const clientOf = (forwardedFor: string, trustedProxies?: string[]) =>
    getIp(
        new Headers({ "x-forwarded-for": forwardedFor }),
        authOptions({ trustedProxies }),
    );

describe("the client the sign-in rate limit counts", () => {
    beforeEach(() => {
        vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-the-ip-check-only");
        vi.stubEnv("NODE_ENV", "production");
    });

    it("is the visitor behind the proxies, not one bucket for everyone", () => {
        expect(clientOf("203.0.113.9, 172.70.1.2, 10.0.1.4", PROXIES)).toBe(
            "203.0.113.9",
        );
    });

    it("can't be named by the visitor", () => {
        expect(clientOf("1.2.3.4, 203.0.113.9, 172.70.1.2", PROXIES)).toBe(
            "203.0.113.9",
        );
    });
});
