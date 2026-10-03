const mockEnv: Record<string, string | undefined> = {};
jest.mock("../../env", () => ({ env: mockEnv }));

import type { Job } from "@saroh/database";

import { pendingFromFor } from "./moves.service";
import {
    enqueueSiteRevalidation,
    PRICING_REVALIDATE_TYPE,
    REVALIDATE_SECRET_HEADER,
    RevalidateSiteHandler,
} from "./revalidate-site.job";

const SECRET = "a-revalidate-secret-that-is-long-enough-0";
const job = (payload: unknown = { version: 4, cause: "publish" }) =>
    ({ id: "job_1", payload }) as unknown as Job;

function configure(on: boolean) {
    mockEnv.PRICING_REVALIDATE_URL = on
        ? "https://site.example.test/api/revalidate"
        : undefined;
    mockEnv.PRICING_REVALIDATE_SECRET = on ? SECRET : undefined;
}

describe("saroh.in revalidation (KTD-10)", () => {
    afterEach(() => configure(false));

    it("queues on the caller's transaction only when the hook is configured", async () => {
        const tx = { job: { create: jest.fn().mockResolvedValue({}) } };
        const at = new Date("2026-10-05T00:00:00Z");

        configure(false);
        expect(
            await enqueueSiteRevalidation(
                tx as never,
                { version: 2, cause: "publish" },
                at,
            ),
        ).toBe(false);
        expect(tx.job.create).not.toHaveBeenCalled();

        configure(true);
        expect(
            await enqueueSiteRevalidation(
                tx as never,
                { version: 2, cause: "go-live" },
                at,
            ),
        ).toBe(true);
        expect(tx.job.create).toHaveBeenCalledWith({
            data: {
                type: PRICING_REVALIDATE_TYPE,
                payload: { version: 2, cause: "go-live" },
                runAt: at,
            },
        });
    });

    it("POSTs with the secret in its header and no path", async () => {
        configure(true);
        const handler = new RevalidateSiteHandler();
        const fetchFn = jest
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        handler.fetchFn = fetchFn;

        await handler.handle(job());

        expect(fetchFn).toHaveBeenCalledTimes(1);
        const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://site.example.test/api/revalidate");
        expect(init.method).toBe("POST");
        expect(
            (init.headers as Record<string, string>)[REVALIDATE_SECRET_HEADER],
        ).toBe(SECRET);
        expect(init.body).toBe("{}");
    });

    it("throws when the site is down or refuses, so the queue retries", async () => {
        configure(true);
        const handler = new RevalidateSiteHandler();

        handler.fetchFn = jest.fn().mockRejectedValue(new TypeError("down"));
        await expect(handler.handle(job())).rejects.toThrow(/unreachable/);

        handler.fetchFn = jest
            .fn()
            .mockResolvedValue(new Response(null, { status: 503 }));
        await expect(handler.handle(job())).rejects.toThrow(/503/);
    });

    it("does nothing, without failing, when the hook was unset since", async () => {
        configure(false);
        const handler = new RevalidateSiteHandler();
        handler.fetchFn = jest.fn();
        await expect(handler.handle(job())).resolves.toBeUndefined();
        expect(handler.fetchFn).not.toHaveBeenCalled();
    });
});

describe("when a business moves (KTD-4)", () => {
    const goLive = new Date("2026-10-01T00:00:00Z");

    it("is its first renewal at least seven days after go-live", () => {
        expect(
            pendingFromFor(new Date("2026-10-03T00:00:00Z"), goLive, "month"),
        ).toEqual(new Date("2026-11-03T00:00:00Z"));
        expect(
            pendingFromFor(new Date("2026-10-20T00:00:00Z"), goLive, "month"),
        ).toEqual(new Date("2026-10-20T00:00:00Z"));
    });

    it("steps a yearly renewal by a year", () => {
        expect(
            pendingFromFor(new Date("2026-10-03T00:00:00Z"), goLive, "year"),
        ).toEqual(new Date("2027-10-03T00:00:00Z"));
    });

    it("is seven days after go-live with no renewal date", () => {
        expect(pendingFromFor(null, goLive, "month")).toEqual(
            new Date("2026-10-08T00:00:00Z"),
        );
    });
});
