/**
 * The launch offer as saroh.in's waitlist page reads it: the pure rule and
 * the controller's contract — 200 with the offer while `LAUNCH_OFFER_DAYS`
 * is set, 404 without, five-minute cache on both. The offer length (37
 * days) is made up. No database.
 */
jest.mock("@saroh/database", () => ({ prisma: {} }));
jest.mock("../../env", () => ({ env: { LAUNCH_OFFER_DAYS: undefined } }));

import { NotFoundException } from "@nestjs/common";
import type { Response } from "express";

import { env } from "../../env";
import {
    LAUNCH_OFFER_PLAN,
    LAUNCH_OFFER_PLAN_NAME,
    publicLaunchOffer,
} from "./launch-offer";
import {
    PUBLIC_OFFER_CACHE,
    PublicLaunchOfferController,
} from "./public-offer.controller";

describe("publicLaunchOffer", () => {
    it("names the offer plan and the configured length", () => {
        expect(publicLaunchOffer(37)).toEqual({
            planId: "grow",
            planName: "Grow",
            days: 37,
        });
        expect(LAUNCH_OFFER_PLAN).toBe("grow");
        expect(LAUNCH_OFFER_PLAN_NAME).toBe("Grow");
    });

    it("is null when no offer length is set", () => {
        expect(publicLaunchOffer(undefined)).toBeNull();
    });

    it("is null for a length that is not a whole number of days", () => {
        expect(publicLaunchOffer(0)).toBeNull();
        expect(publicLaunchOffer(2.5)).toBeNull();
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

describe("PublicLaunchOfferController", () => {
    const controller = new PublicLaunchOfferController();

    afterEach(() => {
        env.LAUNCH_OFFER_DAYS = undefined;
    });

    it("answers the offer from the environment, cacheable for five minutes", () => {
        env.LAUNCH_OFFER_DAYS = 37;
        const { res, headers } = fakeRes();

        expect(controller.get(res)).toEqual({
            planId: LAUNCH_OFFER_PLAN,
            planName: LAUNCH_OFFER_PLAN_NAME,
            days: 37,
        });
        expect(headers["cache-control"]).toBe(PUBLIC_OFFER_CACHE);
        expect(PUBLIC_OFFER_CACHE).toBe("public, max-age=300");
    });

    it("is a 404, cacheable too, when LAUNCH_OFFER_DAYS is unset", () => {
        const { res, headers } = fakeRes();

        expect(() => controller.get(res)).toThrow(NotFoundException);
        expect(headers["cache-control"]).toBe(PUBLIC_OFFER_CACHE);
    });
});
