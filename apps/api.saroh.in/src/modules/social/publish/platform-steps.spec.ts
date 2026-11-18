import { FakeSocialMeta } from "../meta/fake-social-meta";
import type { DeliveryState, StepInput } from "./platform-steps";
import { MAX_CHECKS, MAX_LOOKS, nextStep } from "./platform-steps";

/**
 * One delivery's steps on its platform (U6) against the in-memory Meta:
 * each kind posts, Instagram's limit and a stuck container fail clearly,
 * and a publish whose answer was lost is found by its ref, never sent
 * twice.
 */
const now = new Date("2026-11-18T13:30:00Z");
const frees = new Date("2026-11-19T09:10:00Z");
const input: StepInput = {
    accountId: "acct",
    token: "t",
    imageUrl: "https://cdn.example.com/p.jpg",
    caption: "Mango cheesecake\n\nhttps://x.saroh.app/?ref=social-abcdefghij",
    ref: "social-abcdefghij",
    now,
    limitFreesAt: () => Promise.resolve(frees),
};
const fresh = (kind: DeliveryState["kind"]): DeliveryState => ({
    kind,
    status: "WAITING",
    containerId: null,
    checks: 0,
    attempts: 0,
});

describe("each channel's steps", () => {
    let meta: FakeSocialMeta;
    beforeEach(() => {
        meta = new FakeSocialMeta();
    });

    it("posts to a Facebook Page in one call, with its link", async () => {
        const out = await nextStep(meta, fresh("FACEBOOK"), input);
        expect(out).toMatchObject({
            status: "POSTED",
            permalink: expect.any(String),
        });
        expect(meta.posts).toHaveLength(1);
    });

    it("makes an Instagram container, comes back a minute later, then publishes", async () => {
        const first = await nextStep(meta, fresh("INSTAGRAM"), input);
        expect(first.status).toBe("POSTING");
        expect(first.again).toEqual(new Date(now.getTime() + 60_000));
        const second = await nextStep(
            meta,
            {
                ...fresh("INSTAGRAM"),
                status: "POSTING",
                containerId: first.containerId ?? null,
            },
            input,
        );
        expect(second).toMatchObject({ status: "POSTED" });
        expect(meta.posts).toHaveLength(1);
    });

    it("waits about 30 seconds for a Threads container", async () => {
        const first = await nextStep(meta, fresh("THREADS"), input);
        expect(first.again).toEqual(new Date(now.getTime() + 30_000));
    });

    it("fails at Instagram's daily limit, saying when it will take one again", async () => {
        meta.limit = { used: 50, total: 50 };
        expect(await nextStep(meta, fresh("INSTAGRAM"), input)).toMatchObject({
            status: "FAILED",
            reason: "limit",
            retryAfter: frees,
        });
        expect(meta.posts).toHaveLength(0);
    });

    it("gives up on a container still in progress after five reads", async () => {
        meta.stuck = true;
        const first = await nextStep(meta, fresh("INSTAGRAM"), input);
        let d: DeliveryState = {
            ...fresh("INSTAGRAM"),
            status: "POSTING",
            containerId: first.containerId ?? null,
        };
        for (let i = 1; i < MAX_CHECKS; i++) {
            const out = await nextStep(meta, d, input);
            expect(out.status).toBe("POSTING");
            d = { ...d, checks: out.checks ?? d.checks };
        }
        expect(await nextStep(meta, d, input)).toMatchObject({
            status: "FAILED",
            reason: "stuck",
        });
    });

    it("never posts twice when Meta's answer to a publish was lost", async () => {
        meta.failNext("postPhoto", "retry");
        const first = await nextStep(meta, fresh("FACEBOOK"), input);
        expect(first.status).toBe("UNKNOWN");
        const second = await nextStep(
            meta,
            { ...fresh("FACEBOOK"), status: "UNKNOWN", attempts: 1 },
            input,
        );
        expect(second.status).toBe("POSTED");
        expect(meta.posts).toHaveLength(1);
    });

    it("names a refused picture, and throws a refused token on", async () => {
        meta.failNext("createContainer", "media");
        expect(await nextStep(meta, fresh("INSTAGRAM"), input)).toMatchObject({
            status: "FAILED",
            reason: "media",
        });
        meta.failNext("postPhoto", "auth");
        await expect(
            nextStep(meta, fresh("FACEBOOK"), input),
        ).rejects.toMatchObject({
            kind: "auth",
        });
    });
    it("marks the delivery posting, with the try counted, before Meta is asked (S-01)", async () => {
        const order: string[] = [];
        const marks: number[] = [];
        const out = await nextStep(meta, fresh("FACEBOOK"), {
            ...input,
            beforePublish: async (attempts) => {
                marks.push(attempts);
                order.push(`mark:${meta.posts.length}`);
            },
        });
        expect(marks).toEqual([1]);
        // Marked while nothing was on the Page yet.
        expect(order).toEqual(["mark:0"]);
        expect(out.status).toBe("POSTED");
    });

    it("looks again, minutes apart, before sending an unclear post again (S-06)", async () => {
        let d: DeliveryState = {
            ...fresh("INSTAGRAM"),
            status: "UNKNOWN",
            attempts: 1,
        };
        for (let look = 1; look < MAX_LOOKS; look++) {
            const out = await nextStep(meta, d, input);
            expect(out).toMatchObject({ status: "UNKNOWN", checks: look });
            expect(out.again?.getTime()).toBeGreaterThan(now.getTime());
            d = { ...d, checks: out.checks ?? 0 };
        }
        expect(
            meta.calls.filter((c) => c.method === "createContainer"),
        ).toHaveLength(0);
        // Every look came back empty: only now is it made again.
        const last = await nextStep(meta, d, input);
        expect(last.status).toBe("POSTING");
        expect(
            meta.calls.filter((c) => c.method === "createContainer"),
        ).toHaveLength(1);
    });

    it("never sends again when the look itself fails", async () => {
        let d: DeliveryState = {
            ...fresh("FACEBOOK"),
            status: "UNKNOWN",
            attempts: 1,
        };
        for (let look = 1; look <= MAX_LOOKS; look++) {
            meta.failNext("findByRef", "unknown");
            const out = await nextStep(meta, d, input);
            if (look < MAX_LOOKS) {
                expect(out.status).toBe("UNKNOWN");
                d = { ...d, checks: out.checks ?? 0 };
            } else {
                expect(out).toMatchObject({
                    status: "FAILED",
                    reason: "unknown",
                });
            }
        }
        expect(meta.posts).toHaveLength(0);
    });

    it("takes a container that reads PUBLISHED as posted, never publishing it again (S-06)", async () => {
        const first = await nextStep(meta, fresh("INSTAGRAM"), input);
        const d: DeliveryState = {
            ...fresh("INSTAGRAM"),
            status: "POSTING",
            containerId: first.containerId ?? null,
        };
        // The publish went through and its answer was lost.
        meta.failNext("publishContainer", "retry");
        expect((await nextStep(meta, d, input)).status).toBe("UNKNOWN");
        const again = await nextStep(meta, d, input);
        expect(again).toMatchObject({
            status: "POSTED",
            platformPostId: expect.any(String),
        });
        expect(meta.posts).toHaveLength(1);
    });

    it("carries on without a pre-check when Meta refuses the limit read (S-05)", async () => {
        meta.failNext("publishLimit", "auth");
        const out = await nextStep(meta, fresh("INSTAGRAM"), input);
        expect(out.status).toBe("POSTING");
    });
});
