// @vitest-environment jsdom
/**
 * The account area's frame: the top bar, Back to Saroh, and the menu of
 * what is the person's own. Billing profiles is in it only for an owner;
 * at a desk the menu is the app's SectionList, on a phone its TabStrip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    button,
    draw,
    host,
    setUp,
    tearDown,
    text,
} from "../billing-profiles/test-kit";
import { AccountFrame } from "./account-frame";

let path = "/account/billing-profiles";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("@saroh/ui/sonner", () => ({ Toaster: () => null }));

beforeEach(setUp);
afterEach(tearDown);

const frame = (showBilling: boolean) =>
    draw(
        <AccountFrame
            name="Asha Verma"
            email="asha.verma@example.com"
            appUrl="https://app.saroh.localhost"
            showBilling={showBilling}
        >
            <p>Page</p>
        </AccountFrame>,
    );

/** The desk's SectionList. */
const menu = () =>
    Array.from(host.querySelectorAll("[data-section-list] a")).map((a) => [
        a.textContent,
        a.getAttribute("href"),
        a.getAttribute("aria-current"),
    ]);

describe("the account frame", () => {
    it("has the top bar and, for an owner, all three places", () => {
        path = "/account/billing-profiles";
        frame(true);
        expect(text(host)).toContain("Saroh· Your account");
        expect(button("Back to Saroh", host).getAttribute("href")).toBe(
            "https://app.saroh.localhost",
        );
        expect(text(host)).toContain("AV");
        expect(menu()).toEqual([
            ["Profile and sign-in", "/account", null],
            ["Billing profiles", "/account/billing-profiles", "page"],
            ["Your businesses", "/businesses", null],
        ]);
        expect(text(host)).toContain(
            "These are yours, not any one business's. Teammates never see them.",
        );
    });

    it("leaves Billing profiles out for someone who owns nothing", () => {
        path = "/account";
        frame(false);
        expect(menu()).toEqual([
            ["Profile and sign-in", "/account", "page"],
            ["Your businesses", "/businesses", null],
        ]);
    });

    it("keeps Billing profiles in the menu, lit, for a teammate on its page", () => {
        path = "/account/billing-profiles";
        frame(false);
        expect(menu()[1]).toEqual([
            "Billing profiles",
            "/account/billing-profiles",
            "page",
        ]);
    });

    it("is the same places as tabs on a phone", () => {
        path = "/businesses";
        frame(true);
        const tabs = Array.from(
            host.querySelectorAll("nav:not([data-section-list]) a"),
        ).map((a) => [a.textContent, a.getAttribute("aria-current")]);
        expect(tabs).toEqual([
            ["Profile and sign-in", null],
            ["Billing profiles", null],
            ["Your businesses", "page"],
        ]);
    });
});
