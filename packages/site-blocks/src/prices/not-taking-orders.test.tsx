import type { RenderedPacks, RenderedPlans } from "@saroh/block-contract";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BuyPackSheet } from "../account/buy-pack-sheet";
import PacksSection from "../blocks/packs";
import PlansSection from "../blocks/plans";
import { plansNotTakingOrders, plansPayOnline } from "../lib/plans-read";
import { NOT_TAKING_ORDERS_TEXT } from "../shop/not-taking-orders";
import type { PublicPack } from "./pack-words";
import { packsOf } from "./pack-words";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/",
}));

/**
 * A website its business's plan paused (#800) takes no orders for class
 * packs and plans either: the block still shows them, offers nothing to
 * click that cannot work — no Buy, no Join, no "Ask about" — and says the
 * business isn't taking orders, naming no plan.
 */

const TEN: PublicPack = {
    id: "pack_10",
    name: "10 classes",
    description: null,
    credits: 10,
    validityDays: 60,
    price: "4500.00",
    currency: "INR",
    kind: "CLASSES",
    singlePrice: null,
};

const PACKS: RenderedPacks = { variant: "default", title: "Class packs" };
const PLANS: RenderedPlans = { title: "Memberships" };

describe("reading a paused site's packs and plans (#800)", () => {
    it("packsOf turns Buy off and keeps the flag", () => {
        expect(
            packsOf({ packs: [TEN], payOnline: true, notTakingOrders: true }),
        ).toEqual({ packs: [TEN], payOnline: false, notTakingOrders: true });
        expect(packsOf({ packs: [TEN], payOnline: true })).toEqual({
            packs: [TEN],
            payOnline: true,
        });
    });

    it("plansNotTakingOrders reads only an explicit true, and Join follows it", () => {
        expect(plansNotTakingOrders({ notTakingOrders: true })).toBe(true);
        expect(plansNotTakingOrders({})).toBe(false);
        expect(plansNotTakingOrders(null)).toBe(false);
        expect(plansPayOnline({ payOnline: true, notTakingOrders: true })).toBe(
            false,
        );
        expect(plansPayOnline({ payOnline: true })).toBe(true);
    });
});

describe("the blocks on a paused site (#800)", () => {
    it("the Class packs block shows the packs, says why, and offers no button", () => {
        render(
            <PacksSection
                content={PACKS}
                feed={{
                    packs: [TEN],
                    payOnline: false,
                    askHref: "/contact#enquiry",
                    notTakingOrders: true,
                }}
            />,
        );
        expect(screen.getByText("10 classes")).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe(
            NOT_TAKING_ORDERS_TEXT,
        );
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("the Plans block shows the plans, says why, and offers no button", () => {
        render(
            <PlansSection
                content={PLANS}
                feed={{
                    plans: [
                        {
                            id: "p_month",
                            name: "Monthly box",
                            description: null,
                            price: "1200.00",
                            currency: "INR",
                            interval: "MONTH",
                            mostChosen: false,
                        },
                    ],
                    joinHref: "/contact#enquiry",
                    payOnline: false,
                    notTakingOrders: true,
                }}
            />,
        );
        expect(screen.getByText("Monthly box")).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe(
            NOT_TAKING_ORDERS_TEXT,
        );
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("keeps the Ask link while the site takes orders", () => {
        render(
            <PacksSection
                content={PACKS}
                feed={{
                    packs: [TEN],
                    payOnline: false,
                    askHref: "/contact#enquiry",
                }}
            />,
        );
        expect(screen.queryByRole("status")).toBeNull();
        expect(screen.getByRole("link")).toBeTruthy();
    });

    it("the account's Buy a pack sheet says the business isn't taking orders", () => {
        render(
            <BuyPackSheet
                open
                onClose={vi.fn()}
                onSale={{
                    payOnline: false,
                    packs: [],
                    notTakingOrders: true,
                }}
                businessName="Pulse Fitness"
                customer={{ name: "Farah Khan", email: "farah@example.in" }}
                api={{ buy: vi.fn(), standing: vi.fn() }}
                onBought={vi.fn()}
            />,
        );
        expect(screen.getByText(NOT_TAKING_ORDERS_TEXT)).toBeTruthy();
        expect(screen.queryByText(/sells packs at the desk/)).toBeNull();
    });
});
