import { afterEach, describe, expect, it, vi } from "vitest";

import { launchOfferLines } from "@/content/waitlist";

import { parseLaunchOffer, readLaunchOffer } from "./launch-offer";

/**
 * The waitlist's launch offer (marketing plan U31): read from the API with
 * once, when the site is built, and anything short of a whole offer is null,
 * the "announced at launch" placeholder. The plan and days here (Plan B,
 * 37) are made up.
 */
const env = vi.hoisted(() => {
    const e: { API_URL?: string; NEXT_PHASE?: string; VERCEL_ENV?: string } = {
        API_URL: "https://api.test",
    };
    return e;
});
vi.mock("@/env", () => ({ env }));

type FetchInit = RequestInit;

function answering(body: unknown, status = 200) {
    return vi.fn((_url: string, _init?: FetchInit) =>
        Promise.resolve(
            new Response(JSON.stringify(body), {
                status,
                headers: { "content-type": "application/json" },
            }),
        ),
    );
}

const asFetch = (f: unknown) => f as typeof fetch;
const OFFER = { planId: "b", planName: "Plan B", days: 37 };

afterEach(() => {
    env.API_URL = "https://api.test";
    env.NEXT_PHASE = undefined;
    env.VERCEL_ENV = undefined;
    vi.restoreAllMocks();
});

describe("readLaunchOffer", () => {
    it("reads /public/waitlist/offer once, when the site is built", async () => {
        const fetcher = answering(OFFER);
        await expect(readLaunchOffer(asFetch(fetcher))).resolves.toEqual({
            planName: "Plan B",
            days: 37,
        });
        const [url, init] = fetcher.mock.calls[0];
        expect(url).toBe("https://api.test/public/waitlist/offer");
        expect(init?.cache).toBe("force-cache");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it("no offer set (404): null, the placeholder", async () => {
        await expect(
            readLaunchOffer(asFetch(answering({ message: "No" }, 404))),
        ).resolves.toBeNull();
    });

    it("no API configured: null, without a request", async () => {
        env.API_URL = undefined;
        const fetcher = answering(OFFER);
        await expect(readLaunchOffer(asFetch(fetcher))).resolves.toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("an error, a timeout or a malformed answer: null, never half an offer", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        await expect(
            readLaunchOffer(asFetch(answering({}, 503))),
        ).resolves.toBeNull();
        await expect(
            readLaunchOffer(
                asFetch(() => Promise.reject(new Error("timed out"))),
            ),
        ).resolves.toBeNull();
        await expect(
            readLaunchOffer(asFetch(answering({ planName: "Plan B" }))),
        ).resolves.toBeNull();
    });
});

describe("parseLaunchOffer", () => {
    it("takes a name and a whole number of days, 1 to 366", () => {
        expect(parseLaunchOffer(OFFER)).toEqual({
            planName: "Plan B",
            days: 37,
        });
        expect(parseLaunchOffer({ planName: " ", days: 37 })).toBeNull();
        expect(parseLaunchOffer({ planName: "Plan B", days: 0 })).toBeNull();
        expect(parseLaunchOffer({ planName: "Plan B", days: 1.5 })).toBeNull();
        expect(parseLaunchOffer({ planName: "Plan B", days: 367 })).toBeNull();
        expect(parseLaunchOffer({ planName: "Plan B", days: "37" })).toBeNull();
        expect(parseLaunchOffer(null)).toBeNull();
    });
});

describe("launchOfferLines", () => {
    it("words the API's plan and days as OQ-1 and DEC-075 have them", () => {
        expect(launchOfferLines({ planName: "Plan B", days: 37 })).toEqual({
            headline: "37 days of Plan B free",
            terms: "No card needed. When it ends, you stay on Free unless you choose a plan.",
            doneLine: "Your invite comes with 37 days of Plan B free.",
        });
    });

    it("API down on a deployment's build: throws rather than publish the placeholder", async () => {
        env.NEXT_PHASE = "phase-production-build";
        env.VERCEL_ENV = "production";
        await expect(
            readLaunchOffer(asFetch(answering({}, 503))),
        ).rejects.toThrow();
    });
});
