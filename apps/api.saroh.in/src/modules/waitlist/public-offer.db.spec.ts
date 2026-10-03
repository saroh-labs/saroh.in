/**
 * `GET /public/waitlist/offer` against a real Postgres (marketing plan U31):
 * the offer the invites carry, named from the live catalogue — set, unset,
 * and the offer plan missing from the live catalogue.
 *
 * The offer length (37 days) and every catalogue here are made up
 * (`test/fixtures/pricing-catalog.ts`). Runs in the integration project,
 * plain and under RLS.
 */
jest.mock("../../env", () => {
    const actual = jest.requireActual<typeof import("../../env")>("../../env");
    return {
        ...actual,
        env: { ...actual.env, LAUNCH_OFFER_DAYS: 37 },
    };
});

import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";
import type { Response } from "express";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { env } from "../../env";
import { LAUNCH_OFFER_PLAN } from "./invite-token";
import { LaunchOfferService } from "./launch-offer.service";
import {
    PUBLIC_OFFER_CACHE,
    PublicLaunchOfferController,
} from "./public-offer.controller";

const DAY = 24 * 60 * 60 * 1000;

async function publish(version: number, goLiveAt: Date, catalog: Catalog) {
    return writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt,
        policy: "keep",
        planRows: planRows(catalog, version),
    });
}

/** The fake catalogue with the offer plan in it, named `name`. */
function withOfferPlan(name: string): Catalog {
    return fakeCatalog((c) => {
        c.plans.push({
            id: LAUNCH_OFFER_PLAN,
            name,
            pricePaise: 44_400,
        });
    });
}

function fakeRes() {
    const headers: Record<string, string> = {};
    const res = {
        setHeader: (k: string, v: string) => {
            headers[k.toLowerCase()] = v;
        },
    };
    return { res: res as unknown as Response, headers };
}

describe("public launch offer (DB, U31)", () => {
    const service = new LaunchOfferService();
    const controller = new PublicLaunchOfferController(service);
    const days = env.LAUNCH_OFFER_DAYS;

    afterEach(async () => {
        env.LAUNCH_OFFER_DAYS = days;
        await prisma.pricingCatalogVersion.deleteMany({});
        await prisma.plan.deleteMany({
            where: { key: { startsWith: "catalog." } },
        });
    });

    it("answers the offer, named as the live catalogue names the plan", async () => {
        await publish(1, new Date(Date.now() - DAY), withOfferPlan("Plan D"));

        const { res, headers } = fakeRes();
        await expect(controller.get(res)).resolves.toEqual({
            planId: LAUNCH_OFFER_PLAN,
            planName: "Plan D",
            days: 37,
        });
        expect(headers["cache-control"]).toBe(PUBLIC_OFFER_CACHE);
    });

    it("follows a rename once the new version is live, not before", async () => {
        const now = new Date();
        await publish(
            1,
            new Date(now.getTime() - DAY),
            withOfferPlan("Plan D"),
        );
        await publish(
            2,
            new Date(now.getTime() + DAY),
            withOfferPlan("Plan E"),
        );

        await expect(service.publicOffer(now)).resolves.toMatchObject({
            planName: "Plan D",
        });
        await expect(
            service.publicOffer(new Date(now.getTime() + 2 * DAY)),
        ).resolves.toMatchObject({ planName: "Plan E" });
    });

    it("is a 404 when the instance gives no offer", async () => {
        env.LAUNCH_OFFER_DAYS = undefined;
        await publish(1, new Date(Date.now() - DAY), withOfferPlan("Plan D"));

        const { res, headers } = fakeRes();
        await expect(controller.get(res)).rejects.toMatchObject({
            status: 404,
        });
        expect(headers["cache-control"]).toBe(PUBLIC_OFFER_CACHE);
    });

    it("is a 404 when the live catalogue has no offer plan", async () => {
        await publish(1, new Date(Date.now() - DAY), fakeCatalog());

        await expect(controller.get(fakeRes().res)).rejects.toMatchObject({
            status: 404,
        });
    });

    it("is a 404 before any catalogue is live", async () => {
        await publish(1, new Date(Date.now() + DAY), withOfferPlan("Plan D"));

        await expect(service.publicOffer(new Date())).resolves.toBeNull();
        await expect(controller.get(fakeRes().res)).rejects.toMatchObject({
            status: 404,
        });
    });
});
