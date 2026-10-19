// @vitest-environment jsdom
/**
 * The account area's frame: the top bar, Back to Saroh, and the menu of
 * what is the person's own. Billing profiles is in it only for an owner;
 * on a phone the menu is a row of tabs (one nav, laid out by width).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    button,
    draw,
    host,
    must,
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

const menu = () =>
    Array.from(host.querySelectorAll("nav[aria-label='Your account'] a")).map(
        (a) => [
            a.textContent,
            a.getAttribute("href"),
            a.getAttribute("aria-current"),
        ],
    );

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

    it("is a row of tabs on a phone and a column from md up", () => {
        path = "/account/billing-profiles/bp_1";
        frame(true);
        const nav = must(host.querySelector("nav[aria-label='Your account']"));
        expect(nav.className).toContain("overflow-x-auto");
        expect(nav.className).toContain("md:flex-col");
        for (const a of Array.from(nav.querySelectorAll("a"))) {
            expect(a.className).toContain("min-h-11");
        }
        expect(menu()[1]?.[2]).toBe("page");
    });
});
