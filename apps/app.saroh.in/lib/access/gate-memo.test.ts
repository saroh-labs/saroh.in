/**
 * The gate's kept answers (`gate-memo.ts`): per person (hashed session),
 * epoch and business; successes only; shared while in flight; bounded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let cookie = "";
vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(new Headers({ cookie })),
}));
vi.mock("@/lib/api/http", () => ({
    getActiveOrgId: () => Promise.resolve("org_a"),
}));

import { GATE_EPOCH_COOKIE } from "./gate-epoch";
import {
    clearGateMemo,
    forgetGate,
    forgetGateAfter,
    GATE_MEMO_MAX,
    GATE_MEMO_TTL_MS,
    remembered,
    seedGate,
} from "./gate-memo";

const ANN = "better-auth.session_token=ann-token";
const BOB = "__Secure-better-auth.session_token=bob-token";

let reads: number;
const read = () => {
    reads += 1;
    return Promise.resolve({ n: reads });
};

beforeEach(() => {
    clearGateMemo();
    cookie = ANN;
    reads = 0;
});
afterEach(() => vi.useRealTimers());

describe("remembered", () => {
    it("reads once per person and business within the window", async () => {
        expect(await remembered("org_a", "me", read)).toEqual({ n: 1 });
        expect(await remembered("org_a", "me", read)).toEqual({ n: 1 });
        // Another kind, another business: their own reads.
        await remembered("org_a", "modules", read);
        await remembered("org_b", "me", read);
        expect(reads).toBe(3);
    });

    it("two sessions on one business never share an entry", async () => {
        await remembered("org_a", "me", read);
        cookie = BOB;
        expect(await remembered("org_a", "me", read)).toEqual({ n: 2 });
        cookie = ANN;
        expect(await remembered("org_a", "me", read)).toEqual({ n: 1 });
    });

    it("keeps nothing signed out", async () => {
        cookie = "active_org=org_a";
        await remembered("org_a", "me", read);
        await remembered("org_a", "me", read);
        expect(reads).toBe(2);
    });

    it("reads again once the window has passed", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        await remembered("org_a", "me", read);
        vi.setSystemTime(Date.now() + GATE_MEMO_TTL_MS - 1);
        await remembered("org_a", "me", read);
        expect(reads).toBe(1);
        vi.setSystemTime(Date.now() + 2);
        await remembered("org_a", "me", read);
        expect(reads).toBe(2);
    });

    it("never keeps a refusal or a failure", async () => {
        const refused = Object.assign(new Error("GET /me"), { status: 403 });
        await expect(
            remembered("org_a", "me", () => Promise.reject(refused)),
        ).rejects.toBe(refused);
        await expect(
            remembered("org_a", "me", () => Promise.reject(new Error("503"))),
        ).rejects.toThrow("503");
        expect(await remembered("org_a", "me", read)).toEqual({ n: 1 });
    });

    it("shares one read in flight", async () => {
        let finish!: (v: string) => void;
        const slow = vi.fn(
            () => new Promise<string>((resolve) => (finish = resolve)),
        );
        const a = remembered("org_a", "me", slow);
        const b = remembered("org_a", "me", slow);
        await vi.waitFor(() => expect(slow).toHaveBeenCalled());
        finish("row");
        expect(await Promise.all([a, b])).toEqual(["row", "row"]);
        expect(slow).toHaveBeenCalledTimes(1);
    });

    it("a read in flight that fails is read again by the one sharing it", async () => {
        let fail!: (e: Error) => void;
        const a = remembered(
            "org_a",
            "me",
            () => new Promise((_, reject) => (fail = reject)),
        );
        const b = remembered("org_a", "me", read);
        await vi.waitFor(() => expect(fail).toBeTypeOf("function"));
        fail(new Error("cancelled"));
        await expect(a).rejects.toThrow("cancelled");
        expect(await b).toEqual({ n: 1 });
    });

    it("drops the least recently used past its bound", async () => {
        await remembered("first", "me", read);
        await remembered("touched", "me", read);
        for (let i = 0; i < GATE_MEMO_MAX - 2; i++) {
            await remembered(`org_${i}`, "me", read);
        }
        await remembered("touched", "me", read); // used again: now newest
        await remembered("one-more", "me", read); // past the bound
        const before = reads;
        await remembered("touched", "me", read);
        expect(reads).toBe(before);
        await remembered("first", "me", read);
        expect(reads).toBe(before + 1);
    });
});

describe("seedGate", () => {
    it("keeps an answer read another way, never over a fresher one", async () => {
        await seedGate("org_a", "me", { n: 0 });
        expect(await remembered("org_a", "me", read)).toEqual({ n: 0 });
        await seedGate("org_a", "me", { n: 9 });
        expect(await remembered("org_a", "me", read)).toEqual({ n: 0 });
        expect(reads).toBe(0);
    });
});

describe("forgetGate", () => {
    it("drops the business's entries, for everyone, and only its", async () => {
        await remembered("org_a", "me", read);
        await remembered("org_b", "me", read);
        await forgetGate("org_a");
        expect(await remembered("org_a", "me", read)).toEqual({ n: 3 });
        expect(await remembered("org_b", "me", read)).toEqual({ n: 2 });
    });

    it("a new epoch is a miss in any isolate", async () => {
        await remembered("org_a", "modules", read);
        cookie = `${ANN}; ${GATE_EPOCH_COOKIE}=abc`;
        expect(await remembered("org_a", "modules", read)).toEqual({ n: 2 });
    });

    it("forgets only after a save that worked; the open business by default", async () => {
        await remembered("org_a", "me", read);
        await forgetGateAfter({ ok: false });
        expect(await remembered("org_a", "me", read)).toEqual({ n: 1 });
        await forgetGateAfter({ ok: true });
        expect(await remembered("org_a", "me", read)).toEqual({ n: 2 });
    });
});
