import { formatInr, offeredPlans } from "@saroh/pricing-catalog";
import { SEED_CATALOG } from "@saroh/pricing-catalog/seed";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readPlans } from "./plans";

const answer =
    (status: number, body: unknown = {}): typeof fetch =>
    () =>
        Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("readPlans", () => {
    beforeEach(() => {
        vi.stubEnv("API_URL", "https://api.example.com");
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("is null without API_URL, on a 404, a failure or a bad catalogue", async () => {
        expect(await readPlans(answer(404))).toBeNull();
        expect(await readPlans(answer(500))).toBeNull();
        expect(await readPlans(answer(200, { catalog: {} }))).toBeNull();
        expect(
            await readPlans(() => Promise.reject(new Error("down"))),
        ).toBeNull();
        vi.stubEnv("API_URL", "");
        expect(
            await readPlans(answer(200, { catalog: SEED_CATALOG })),
        ).toBeNull();
    });

    it("draws the catalogue's offered plans with its own money", async () => {
        const cards = await readPlans(answer(200, { catalog: SEED_CATALOG }));
        const offered = offeredPlans(SEED_CATALOG);
        expect(cards?.map((c) => c.name)).toEqual(offered.map((p) => p.name));
        expect(cards?.[0]?.price).toBe(formatInr(offered[0]?.pricePaise ?? -1));
        expect(cards?.[1]?.lead).toContain(offered[0]?.name);
    });
});
