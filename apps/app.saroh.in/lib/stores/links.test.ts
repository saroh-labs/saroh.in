import { describe, expect, it, vi } from "vitest";

import StorefrontDetailsPage from "@/app/(shell)/commerce/locations/[storeId]/details/page";

import {
    storefrontDetailsHref,
    storefrontHref,
    storefrontPeopleHref,
} from "./links";
import { LOCATION_TABS } from "./location-readiness";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

/** Where a location's own screens live. Made-up ids only. */
describe("a location's links", () => {
    it("the page itself, and a tab of it", () => {
        expect(storefrontHref("st_1")).toBe(
            "/commerce/locations?storefront=st_1",
        );
        expect(storefrontHref("st_1", "the-place")).toBe(
            "/commerce/locations?storefront=st_1",
        );
        expect(storefrontHref("st_1", "delivery")).toBe(
            "/commerce/locations?storefront=st_1&section=delivery",
        );
    });

    it("its people are the People tab, so every old link lands on it", () => {
        expect(storefrontPeopleHref("st_1")).toBe(
            "/commerce/locations?storefront=st_1&section=people",
        );
        expect(storefrontPeopleHref("st_1")).toBe(
            storefrontHref("st_1", "people"),
        );
        expect(storefrontPeopleHref("a b")).toBe(
            "/commerce/locations?storefront=a%20b&section=people",
        );
    });

    it("People is a tab the page offers, after Customers and before Pause or close", () => {
        expect(LOCATION_TABS).toEqual([
            "the-place",
            "payments",
            "delivery",
            "customers",
            "people",
            "pause-or-close",
        ]);
    });

    it("its description and logo are a sheet on The place, opened by the address", () => {
        expect(storefrontDetailsHref("st_1")).toBe(
            "/commerce/locations?storefront=st_1&edit=details",
        );
        expect(storefrontDetailsHref("a b")).toBe(
            "/commerce/locations?storefront=a%20b&edit=details",
        );
    });

    it("the old details page sends every link to it there", async () => {
        await StorefrontDetailsPage({
            params: Promise.resolve({ storeId: "st_1" }),
        });
        expect(redirect).toHaveBeenCalledWith(
            "/commerce/locations?storefront=st_1&edit=details",
        );
    });
});
