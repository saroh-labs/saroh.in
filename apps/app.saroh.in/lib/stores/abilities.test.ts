import { describe, expect, it } from "vitest";

import {
    NO_PAYMENTS_HERE,
    payInForce,
    payNote,
    payOptions,
} from "@/lib/orders/new-order";
import { newOrderStores } from "@/lib/orders/new-order-stores";

import { abilitiesOf, orderPlaces } from "./abilities";
import { detailsOf } from "./location-details";
import { peopleNote, roleLine } from "./people";
import { placeSheetToOpen } from "./place-rows";

/**
 * What a location's own read lets its people do (UX audit, 10 Oct 2026):
 * a location Admin, Manager or Editor is offered what the API takes from
 * them, and nothing it refuses. Made-up values only.
 */
const EDITOR = {
    edit: true,
    takeOrders: true,
    takePayments: false,
    changeOrders: true,
};
const VIEWER = {
    edit: false,
    takeOrders: false,
    takePayments: false,
    changeOrders: false,
};

describe("abilitiesOf, what the location's read said", () => {
    it("reads the four answers", () => {
        expect(abilitiesOf(EDITOR)).toEqual(EDITOR);
        expect(abilitiesOf(VIEWER)).toEqual(VIEWER);
    });

    it("offers nothing more when the API said nothing, or half of it", () => {
        expect(abilitiesOf(undefined)).toBeNull();
        expect(abilitiesOf(null)).toBeNull();
        expect(abilitiesOf("yes")).toBeNull();
        expect(abilitiesOf({ edit: true })).toBeNull();
        expect(abilitiesOf({ ...EDITOR, takeOrders: "true" })).toBeNull();
    });

    it("comes with the location's description and logo, from the one read", () => {
        expect(
            detailsOf({ description: "Sourdough", abilities: EDITOR }).may,
        ).toEqual(EDITOR);
        expect(detailsOf({ description: "Sourdough" }).may).toBeUndefined();
    });
});

describe("where New order is offered to someone the business role gives none", () => {
    const stores = [
        { id: "hill", name: "Hill Road" },
        { id: "market", name: "Market" },
    ];

    it("is the locations whose own read says they may, with whether the money too", () => {
        expect(
            orderPlaces([
                { id: "hill", abilities: EDITOR },
                { id: "market", abilities: VIEWER },
                { id: "pier", abilities: null },
            ]),
        ).toEqual([{ id: "hill", money: false }]);
        expect(
            orderPlaces([
                { id: "hill", abilities: { ...EDITOR, takePayments: true } },
            ]),
        ).toEqual([{ id: "hill", money: true }]);
    });

    it("a location Editor takes orders at their location, in the kitchen's view too", () => {
        expect(
            newOrderStores(stores, true, [{ id: "hill", money: false }]),
        ).toEqual([stores[0]]);
    });

    it("a location Viewer, and a Member, are offered none", () => {
        expect(newOrderStores(stores, true, [])).toEqual([]);
        expect(newOrderStores(stores, true, undefined)).toEqual([]);
    });

    it("someone the business role lets takes them everywhere", () => {
        expect(newOrderStores(stores, false, undefined)).toEqual(stores);
    });
});

describe("New order's payment, for someone who takes the order and not its money", () => {
    const pick = { kind: "walk-in", name: "Asha", phone: "" } as const;

    it("offers pay on collection and nothing that records a payment", () => {
        const options = payOptions({
            pick,
            way: "PICKUP",
            canLink: false,
            money: false,
        });
        expect(options.map((o) => o.key)).toEqual(["LATER"]);
        expect(options[0].off).toBeNull();
    });

    it("starts on it, since cash isn't offered", () => {
        const options = payOptions({
            pick,
            way: "PICKUP",
            canLink: false,
            money: false,
        });
        expect(payInForce(options, "CASH")).toBe("LATER");
    });

    it("a delivery stays stopped by its reason, never handed to a way they can't take", () => {
        const options = payOptions({
            pick,
            way: "LOCAL_DELIVERY",
            canLink: false,
            money: false,
        });
        expect(payInForce(options, "LATER")).toBe("LATER");
        expect(options[0].off).toBe("Deliveries are paid before they go");
    });

    it("says why under it", () => {
        expect(payNote("LATER", "₹430", null, false)).toBe(
            `Nothing taken now. It shows as unpaid until they pay at the counter. ${NO_PAYMENTS_HERE}`,
        );
    });

    it("leaves everyone else's chips as they were", () => {
        const options = payOptions({
            pick,
            way: "LOCAL_DELIVERY",
            canLink: true,
        });
        expect(options.map((o) => o.key)).toEqual([
            "CASH",
            "UPI",
            "CARD",
            "LINK",
            "LATER",
        ]);
        expect(payInForce(options, "LATER")).toBe("CARD");
        expect(payInForce(options, "LINK")).toBe("CASH");
        expect(payInForce(options, "UPI")).toBe("UPI");
    });
});

describe("The place's sheets, for someone who edits only what the location's route saves", () => {
    const page = {
        canEdit: false,
        canEditAbout: true,
        kind: "SHOP",
        hasDetails: true,
    } as const;

    it("opens its name and its description and logo", () => {
        expect(placeSheetToOpen("name", page)).toBe("name");
        expect(placeSheetToOpen("details", page)).toBe("details");
    });

    it("opens nothing the business's settings route saves", () => {
        expect(placeSheetToOpen("kind", page)).toBeNull();
        expect(placeSheetToOpen("address", page)).toBeNull();
        expect(placeSheetToOpen("hours", page)).toBeNull();
    });

    it("a Viewer still opens none", () => {
        expect(
            placeSheetToOpen("name", { ...page, canEditAbout: false }),
        ).toBeNull();
    });
});

describe("what a location role is said to get", () => {
    it("a Viewer reads and moves orders along", () => {
        expect(roleLine("VIEWER")).toBe(
            "Sees this location's products and orders and moves its orders along. Changes nothing else.",
        );
    });

    it("an Admin, Manager and Editor are promised the same, and never money", () => {
        const line = roleLine("EDITOR");
        expect(roleLine("ADMIN")).toBe(line);
        expect(roleLine("MANAGER")).toBe(line);
        expect(line).toContain("takes new orders here");
        expect(line).toContain("Never payments or refunds.");
    });

    it("the People tab says both", () => {
        expect(peopleNote("Hill Road")).toBe(
            "Who can see Hill Road's products and orders, and move its orders along. An Admin, Manager or Editor can also take orders here and change its name and description. Everyone here is also on your team, under Team.",
        );
    });
});
