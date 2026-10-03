/**
 * The launch offer as saroh.in's waitlist page reads it (marketing plan
 * U31): the pure rule that names it from the live catalogue, and the
 * controller's contract — 200 with the offer, 404 without, five-minute cache
 * on both. The offer length (37 days) and plan names are made up; the
 * catalogue is a fake one. No database.
 */
jest.mock("@saroh/database", () => ({ prisma: {} }));

import { NotFoundException } from "@nestjs/common";
import type { Response } from "express";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import {
    LAUNCH_OFFER_PLAN,
    launchOffer,
    publicLaunchOffer,
} from "./invite-token";
import type { LaunchOfferService } from "./launch-offer.service";
import {
    PUBLIC_OFFER_CACHE,
    PublicLaunchOfferController,
} from "./public-offer.controller";

/** The fake catalogue, with the offer plan in it under a made-up name. */
const withOfferPlan = fakeCatalog((c) => {
    c.plans.push({
        ...c.plans[1]!,
        id: LAUNCH_OFFER_PLAN,
        name: "Plan D",
        featured: false,
    });
});

describe("publicLaunchOffer", () => {
    it("names the offer plan as the live catalogue names it", () => {
        expect(publicLaunchOffer(launchOffer(37), withOfferPlan)).toEqual({
            planId: LAUNCH_OFFER_PLAN,
            planName: "Plan D",
            days: 37,
        });
    });

    it("is null when no offer length is set", () => {
        expect(
            publicLaunchOffer(launchOffer(undefined), withOfferPlan),
        ).toBeNull();
    });

    it("is null before any catalogue is live", () => {
        expect(publicLaunchOffer(launchOffer(37), null)).toBeNull();
    });

    it("is null when the live catalogue has no offer plan", () => {
        expect(publicLaunchOffer(launchOffer(37), fakeCatalog())).toBeNull();
    });
});

function fakeRes() {
    const headers: Record<string, string> = {};
    const res = {
        setHeader: (k: string, v: string) => {
            headers[k.toLowerCase()] = v;
        },
    };
    return { res: res as unknown as Response, headers };
}

function controllerAnswering(offer: unknown) {
    return new PublicLaunchOfferController({
        publicOffer: jest.fn().mockResolvedValue(offer),
    } as unknown as LaunchOfferService);
}

describe("PublicLaunchOfferController", () => {
    it("answers the offer, cacheable for five minutes", async () => {
        const offer = {
            planId: LAUNCH_OFFER_PLAN,
            planName: "Plan B",
            days: 37,
        };
        const { res, headers } = fakeRes();

        await expect(controllerAnswering(offer).get(res)).resolves.toEqual(
            offer,
        );
        expect(headers["cache-control"]).toBe(PUBLIC_OFFER_CACHE);
        expect(PUBLIC_OFFER_CACHE).toBe("public, max-age=300");
    });

    it("is a 404, cacheable too, when there is no offer", async () => {
        const { res, headers } = fakeRes();

        await expect(controllerAnswering(null).get(res)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(headers["cache-control"]).toBe(PUBLIC_OFFER_CACHE);
    });
});
