import { FakeSocialMeta } from "../meta/fake-social-meta";
import type { DeliveryState, StepInput } from "./platform-steps";
import { MAX_CHECKS, nextStep } from "./platform-steps";

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
});
