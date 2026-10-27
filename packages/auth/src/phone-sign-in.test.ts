import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateAuthOptions } from "./server";
import { authOptions, startPhoneSession } from "./server";

/**
 * The session half of phone sign-in (DEC-196), on the real library with
 * Saroh's own options: the session is Better Auth's own, its hooks apply,
 * and nothing reaches it over HTTP.
 */

const ORIGIN = "https://accounts.saroh.in";
const BASE = "https://api.saroh.in";

function stack(hooks: Pick<CreateAuthOptions, "mayStartSession"> = {}) {
    type Rows = Record<string, unknown>[];
    const db = {
        user: [] as Rows,
        session: [] as Rows,
        account: [] as Rows,
        verification: [] as Rows,
        rateLimit: [] as Rows,
    };
    const auth = betterAuth({
        ...authOptions({ ...hooks }),
        baseURL: BASE,
        trustedOrigins: [ORIGIN],
        database: memoryAdapter(db),
        rateLimit: { enabled: false },
        logger: { disabled: true },
    });
    const post = (path: string, body: unknown, cookie = "") =>
        auth.handler(
            new Request(`${BASE}/api/auth${path}`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    origin: ORIGIN,
                    cookie,
                },
                body: JSON.stringify(body),
            }),
        );
    const user = { id: "u1", email: "asha@example.com" };
    db.user.push({
        ...user,
        name: "Asha",
        emailVerified: true,
        phoneE164: "+919876543210",
        phoneVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return { auth, db, post, user };
}

function cookieOf(headers: Headers): string {
    return headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
}

describe("phone sign-in's session", () => {
    beforeEach(() => {
        vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-the-phone-flow");
        vi.stubEnv("BETTER_AUTH_URL", BASE);
    });

    it("makes Better Auth's own session and cookie, read back by getSession", async () => {
        const s = stack();
        const headers = await startPhoneSession(s.auth, {
            userId: s.user.id,
            headers: new Headers({ "user-agent": "test" }),
        });
        expect(s.db.session).toHaveLength(1);
        const session = await s.auth.api.getSession({
            headers: new Headers({ cookie: cookieOf(headers) }),
        });
        expect(session?.user.id).toBe(s.user.id);
        // The verified phone rides on the session's user.
        expect(session?.user).toMatchObject({ phoneE164: "+919876543210" });
    });

    it("is refused, with no session, when the host's mayStartSession says no", async () => {
        const s = stack({ mayStartSession: () => false });
        await expect(
            startPhoneSession(s.auth, {
                userId: s.user.id,
                headers: new Headers(),
            }),
        ).rejects.toMatchObject({ statusCode: 401 });
        expect(s.db.session).toHaveLength(0);
    });

    it("is refused for an unknown user", async () => {
        const s = stack();
        await expect(
            startPhoneSession(s.auth, {
                userId: "nobody",
                headers: new Headers(),
            }),
        ).rejects.toMatchObject({ statusCode: 401 });
    });

    it("is not on the HTTP router", async () => {
        const s = stack();
        const response = await s.post("/sign-in-verified-phone", {
            userId: s.user.id,
        });
        expect(response.status).toBe(404);
        expect(s.db.session).toHaveLength(0);
    });

    it("never lets a person set their phone through update-user", async () => {
        const s = stack();
        const headers = await startPhoneSession(s.auth, {
            userId: s.user.id,
            headers: new Headers(),
        });
        await s.post(
            "/update-user",
            { phoneE164: "+911111111111", phoneVerifiedAt: new Date() },
            cookieOf(headers),
        );
        expect(s.db.user[0]).toMatchObject({ phoneE164: "+919876543210" });
    });
});
