import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDays, fetchHold, READ_TIMEOUT_MS } from "./api";
import { STILL_FINDING_AFTER_MS, StillFinding } from "./still-finding";

/** A read the API never answers: it ends only when it is given up on. */
function hanging(_url: string, init?: RequestInit): Promise<Response> {
    return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
        );
    });
}
const DAYS = {
    timezone: "Asia/Kolkata",
    kind: "one",
    capacity: 1,
    days: [],
    staff: [],
};
const answer = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("a read of the times that hangs", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("is asked once more, then fails in words after two waits", async () => {
        const seen = vi.fn(hanging);
        vi.stubGlobal("fetch", seen);
        const done = vi.fn();
        void fetchDays("https://api.test", "svc").then(done);

        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
        expect(seen).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(seen).toHaveBeenCalledTimes(2);
        expect(done).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
        expect(seen).toHaveBeenCalledTimes(2);
        expect(done).toHaveBeenCalledWith(
            expect.objectContaining({ ok: false, status: 0 }),
        );
    });

    it("takes the second answer when it comes", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => answer(DAYS)).mockImplementationOnce(hanging as never),
        );
        const late = fetchDays("https://api.test", "svc");
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
        await expect(late).resolves.toMatchObject({ ok: true });
    });

    it("asks again after our side failed, once", async () => {
        const seen = vi.fn(() => answer({}, 503));
        vi.stubGlobal("fetch", seen);
        await expect(
            fetchDays("https://api.test", "svc"),
        ).resolves.toMatchObject({ ok: false, status: 503 });
        expect(seen).toHaveBeenCalledTimes(2);
    });

    it("isn't asked again after an answer: a 404 stays a 404", async () => {
        const seen = vi.fn(() => answer({ error: { message: "Gone" } }, 404));
        vi.stubGlobal("fetch", seen);
        await expect(
            fetchDays("https://api.test", "svc"),
        ).resolves.toMatchObject({ ok: false, status: 404 });
        expect(seen).toHaveBeenCalledTimes(1);
    });

    it("the hold's read waits the same", async () => {
        const seen = vi.fn(hanging);
        vi.stubGlobal("fetch", seen);
        void fetchHold("https://api.test", "tok");
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
        expect(seen).toHaveBeenCalledTimes(2);
    });

    it("says it's still finding times once the wait is long", () => {
        render(<StillFinding />);
        act(() => {
            vi.advanceTimersByTime(STILL_FINDING_AFTER_MS - 1);
        });
        expect(screen.queryByText("Still finding times…")).toBeNull();
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(screen.getByText("Still finding times…")).toBeTruthy();
    });
});
