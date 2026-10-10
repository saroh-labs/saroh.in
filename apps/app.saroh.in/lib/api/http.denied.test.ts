/**
 * A refusal by role through the app's write seam: `readError` says it in
 * `role-denied.ts`'s words, and `mutate` and `destroy` mark it a denial for
 * the caller to show as a notice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { API_URL: "https://api.test" } }));
vi.mock("next/headers", () => ({
    headers: () =>
        Promise.resolve({
            get: (name: string) => (name === "cookie" ? "session=1" : null),
        }),
    cookies: () => Promise.resolve({ get: () => ({ value: "org_1" }) }),
}));
vi.mock("next/navigation", () => ({ forbidden: vi.fn() }));
vi.mock("@saroh/auth/origins", () => ({ requestOrigin: () => null }));
// `cache` is React's per-request memo. Outside a request it is the function.
vi.mock("react", async (original) => ({
    ...(await original<object>()),
    cache: <T>(fn: T) => fn,
}));

import { destroy, mutate, readError } from "./http";

const WHO = "An owner or admin can change this in Settings › Team.";

const denied = (action: string) => ({
    error: {
        code: "FORBIDDEN",
        message:
            "Your role can't do this. An owner or admin can change that in Settings › Team.",
        statusCode: 403,
        correlationId: "cid",
        details: { code: "ROLE_DENIED", action },
    },
});

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

describe("readError", () => {
    it("says a refusal by role in the closer sentence for its permission", () => {
        expect(readError(denied("booking:write"), "Could not save.")).toBe(
            `Your role can't change bookings. ${WHO}`,
        );
    });

    it("keeps the API's sentence for a permission with no row", () => {
        expect(readError(denied("audit:read"), "Could not load.")).toBe(
            "Your role can't do this. An owner or admin can change that in Settings › Team.",
        );
    });

    it("still reads every other shape as it did", () => {
        expect(readError({ message: "Plain" }, "x")).toBe("Plain");
        expect(readError({ error: "Legacy" }, "x")).toBe("Legacy");
        expect(readError({ error: { message: "Enveloped" } }, "x")).toBe(
            "Enveloped",
        );
        expect(readError(null, "Fallback.")).toBe("Fallback.");
    });
});

describe("mutate and destroy", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        fetchMock.mockReset();
    });

    /** The org list the active-org lookup reads first, then the write. */
    const answer = (status: number, body: unknown) => {
        fetchMock.mockImplementation((url: string) =>
            Promise.resolve(
                url.endsWith("/organizations")
                    ? json(200, [{ id: "org_1" }])
                    : json(status, body),
            ),
        );
    };

    it("mutate marks a refusal by role a denial, in words", async () => {
        answer(403, denied("store:create"));
        expect(await mutate("/stores", "POST", {}, "Could not save.")).toEqual({
            ok: false,
            error: `Your role can't add a location. ${WHO}`,
            denied: true,
        });
    });

    it("destroy marks it too", async () => {
        answer(403, denied("member:remove"));
        expect(await destroy("/members/u_2", "Could not remove.")).toEqual({
            ok: false,
            error: `Your role can't remove people. ${WHO}`,
            denied: true,
        });
    });

    it("leaves any other refusal an error", async () => {
        answer(409, { error: { message: "That name is taken." } });
        expect(await mutate("/x", "POST", {}, "Could not save.")).toEqual({
            ok: false,
            error: "That name is taken.",
        });
    });
});
