/**
 * A write that never got an answer, through the app's write seam (10 Oct
 * 2026): a network failure or 20 seconds without an answer is the one
 * unreached sentence, a 401 the signed-out one, and neither is ever thrown
 * to the caller. Reads are left as they were.
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
const rethrow = vi.fn<(error: unknown) => void>();
vi.mock("next/navigation", () => ({
    forbidden: vi.fn(),
    unstable_rethrow: (error: unknown) => {
        rethrow(error);
    },
}));
vi.mock("@saroh/auth/origins", () => ({ requestOrigin: () => null }));
vi.mock("react", async (original) => ({
    ...(await original<object>()),
    cache: <T>(fn: T) => fn,
}));

import { apiFetch, destroy, getJson, mutate, readError } from "./http";
import { SIGNED_OUT, UNREACHED, WRITE_TIMEOUT_MS } from "./unreached";

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

type Call = (url: string, init?: RequestInit) => Promise<Response>;

/** A response's JSON, as `readError` takes it. */
const body = async (res: Response) =>
    (await res.json()) as { message?: string } | null;

describe("a write that didn't reach the API", () => {
    const fetchMock = vi.fn<Call>();
    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock);
        rethrow.mockReset();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        fetchMock.mockReset();
    });

    /** The org list the active-org lookup reads first, then the write. */
    const write = (answer: Call) => {
        fetchMock.mockImplementation((url, init) =>
            url.endsWith("/organizations")
                ? Promise.resolve(json(200, [{ id: "org_1" }]))
                : answer(url, init),
        );
    };
    const offline = () => Promise.reject(new TypeError("fetch failed"));

    it("the two sentences are the ones a person reads", () => {
        expect(UNREACHED).toBe(
            "We couldn't confirm that was saved. Check your connection, see whether it went through, then try again.",
        );
        expect(SIGNED_OUT).toBe(
            "You've been signed out. Sign in again and what you typed stays here.",
        );
    });

    it("mutate offline answers the unreached sentence, and doesn't throw", async () => {
        write(offline);
        await expect(
            mutate("/services", "POST", { name: "Cut" }, "Could not save."),
        ).resolves.toEqual({ ok: false, error: UNREACHED, unreached: true });
    });

    it("destroy offline answers it too", async () => {
        write(offline);
        await expect(
            destroy("/services/svc_1", "Could not delete."),
        ).resolves.toEqual({ ok: false, error: UNREACHED, unreached: true });
    });

    it("a write is given 20 seconds, then it is unreached", async () => {
        const limit = new AbortController();
        const timeout = vi
            .spyOn(AbortSignal, "timeout")
            .mockReturnValue(limit.signal);
        // An API that never answers: only the limit ends the request.
        write(
            (_url, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () => {
                        reject(new DOMException("timed out", "TimeoutError"));
                    });
                }),
        );

        const pending = mutate("/services", "PATCH", {}, "Could not save.");
        // The org lookup resolves first; then the write is waiting.
        await vi.waitFor(() => expect(timeout).toHaveBeenCalled());
        limit.abort();

        expect(await pending).toEqual({
            ok: false,
            error: UNREACHED,
            unreached: true,
        });
        expect(timeout).toHaveBeenCalledWith(WRITE_TIMEOUT_MS);
        expect(WRITE_TIMEOUT_MS).toBe(20_000);
    });

    it("an answer cut off while it is read is unreached, never an empty success", async () => {
        write(() =>
            Promise.resolve({
                status: 200,
                statusText: "OK",
                headers: new Headers(),
                arrayBuffer: () =>
                    Promise.reject(new DOMException("aborted", "AbortError")),
            } as unknown as Response),
        );
        expect(await mutate("/x", "POST", {}, "Could not save.")).toEqual({
            ok: false,
            error: UNREACHED,
            unreached: true,
        });
    });

    it("a 401 answers the signed-out sentence, marked expired", async () => {
        write(() =>
            Promise.resolve(
                json(401, {
                    error: { message: "Invalid or expired session" },
                }),
            ),
        );
        expect(await mutate("/x", "POST", {}, "Could not save.")).toEqual({
            ok: false,
            error: SIGNED_OUT,
            expired: true,
        });
        expect(await destroy("/x", "Could not delete.")).toEqual({
            ok: false,
            error: SIGNED_OUT,
            expired: true,
        });
    });

    it("a write that reads its own response says the same two things", async () => {
        // 81 call sites use `apiFetch` with a method and `readError`.
        write(offline);
        const unreached = await apiFetch("/organizations/org_1/x/read", {
            method: "POST",
        });
        expect(unreached.ok).toBe(false);
        expect(readError(await body(unreached), "Could not mark.")).toBe(
            UNREACHED,
        );

        write(() => Promise.resolve(json(401, { message: "Unauthorized" })));
        const expired = await apiFetch("/organizations/org_1/x/read", {
            method: "POST",
        });
        expect(expired.status).toBe(401);
        expect(readError(await body(expired), "Could not mark.")).toBe(
            SIGNED_OUT,
        );
    });

    it("a save that worked, and an API refusal, pass through as they were", async () => {
        write(() => Promise.resolve(json(200, { id: "svc_1" })));
        expect(await mutate("/services", "POST", {}, "x")).toEqual({
            ok: true,
            data: { id: "svc_1" },
        });

        write(() => Promise.resolve(new Response(null, { status: 204 })));
        expect(await destroy("/services/svc_1", "x")).toEqual({
            ok: true,
            data: {},
        });

        write(() =>
            Promise.resolve(
                json(409, { error: { message: "That name is taken." } }),
            ),
        );
        expect(await mutate("/services", "POST", {}, "x")).toEqual({
            ok: false,
            error: "That name is taken.",
        });
    });

    it("something thrown before the request is unreached too, not thrown", async () => {
        // The read of which business is open fails first.
        fetchMock.mockImplementation(offline);
        await expect(
            mutate("/services", "POST", {}, "Could not save."),
        ).resolves.toEqual({ ok: false, error: UNREACHED, unreached: true });
        // Next's own interrupts are asked about before it is called that.
        expect(rethrow).toHaveBeenCalled();
    });

    it("one of Next's interrupts is passed on, not called unreached", async () => {
        const interrupt = new Error("NEXT_REDIRECT");
        rethrow.mockImplementation((error: unknown) => {
            if (error === interrupt) throw interrupt;
        });
        write(() => Promise.reject(interrupt));
        await expect(mutate("/x", "POST", {}, "x")).rejects.toBe(interrupt);
    });

    it("a read is sent with no limit, and still rejects when offline", async () => {
        const timeout = vi.spyOn(AbortSignal, "timeout");
        write(offline);
        await expect(getJson("/organizations/org_1/services")).rejects.toThrow(
            "fetch failed",
        );
        expect(timeout).not.toHaveBeenCalled();
        const read = fetchMock.mock.calls.find(
            ([url]) => !url.endsWith("/organizations"),
        );
        expect(read?.[1]?.signal).toBeUndefined();
    });
});
