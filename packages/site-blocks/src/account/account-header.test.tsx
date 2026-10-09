import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    AccountHeader,
    accountTitle,
    businessInitial,
    isAccountPath,
    SiteChromeFrame,
} from "./account-header";
import type { AccountTab } from "./model";

/**
 * The account area's compact header and the site's chrome stepping aside
 * for it (DEC-073 #10; Saroh Customer Site design): the business's letter
 * back to the site, the tab's title, and no site header or footer.
 */

let pathname = "/account";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const TABS: AccountTab[] = [
    { key: "home", label: "Home" },
    { key: "bookings", label: "Appointments" },
    { key: "messages", label: "Messages" },
    { key: "me", label: "Me" },
];

beforeEach(() => {
    pathname = "/account";
});

describe("accountTitle", () => {
    it("greets the customer by first name on Home", () => {
        expect(accountTitle("/account", TABS, "Farah Khan")).toBe("Hi, Farah");
        expect(accountTitle("/account/", TABS, null)).toBe("Hi there");
    });

    it("names the current tab as this business calls it", () => {
        expect(accountTitle("/account/bookings", TABS, "Farah")).toBe(
            "Appointments",
        );
        expect(accountTitle("/account/me", TABS, "Farah")).toBe("Me");
    });

    it("calls a receipt a receipt, and anything else the account", () => {
        expect(accountTitle("/account/receipts/inv_1", TABS, null)).toBe(
            "Receipt",
        );
        // A tab this business doesn't show.
        expect(accountTitle("/account/orders", TABS, null)).toBe(
            "Your account",
        );
        expect(accountTitle(null, TABS, null)).toBe("Your account");
    });
});

describe("businessInitial", () => {
    it("takes the first letter or digit of the name", () => {
        expect(businessInitial("Kavi Dental")).toBe("K");
        expect(businessInitial("  rye & co.")).toBe("R");
        expect(businessInitial("99 Bakes")).toBe("9");
        expect(businessInitial("")).toBe("·");
    });
});

describe("AccountHeader", () => {
    it("draws the letter back to the site and the tab's title as the page's heading", () => {
        pathname = "/account/messages";
        render(<AccountHeader businessName="Kavi Dental" tabs={TABS} />);
        const back = screen.getByRole("link", {
            name: "Back to the site: Kavi Dental",
        });
        expect(back.getAttribute("href")).toBe("/");
        expect(back.textContent).toBe("K");
        expect(back.className).toContain("bg-site-accent");
        expect(back.className).toContain("cursor-pointer");
        expect(
            screen.getByRole("heading", { level: 1, name: "Messages" }),
        ).toBeTruthy();
        // No language switch: the site has no second language yet.
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("names the business, a link back to the site (UX-075)", () => {
        render(<AccountHeader businessName="Kavi Dental" tabs={TABS} />);
        const name = screen.getByRole("link", { name: "Kavi Dental" });
        expect(name.getAttribute("href")).toBe("/");
    });

    it("takes the caller's title while signed out", () => {
        render(<AccountHeader businessName="Pulse" title="Your account" />);
        expect(
            screen.getByRole("heading", { level: 1, name: "Your account" }),
        ).toBeTruthy();
    });

    it("never draws Saroh's own tokens", () => {
        const { container } = render(
            <AccountHeader businessName="Pulse" tabs={TABS} />,
        );
        expect(container.innerHTML).not.toMatch(
            /\b(?:bg|text|border)-(?:primary|foreground|background|muted|accent)\b/,
        );
    });
});

describe("SiteChromeFrame", () => {
    const draw = (account: boolean) =>
        render(
            <SiteChromeFrame
                account={account}
                header={<header>Site header</header>}
                footer={<footer>Runs on Saroh</footer>}
            >
                <p>Page</p>
            </SiteChromeFrame>,
        );

    it("leaves the site's header and footer out on the account area", () => {
        pathname = "/account/bookings";
        draw(true);
        expect(screen.getByText("Page")).toBeTruthy();
        expect(screen.queryByText("Site header")).toBeNull();
        expect(screen.queryByText("Runs on Saroh")).toBeNull();
    });

    it("keeps them everywhere else, including a page that starts 'account'", () => {
        pathname = "/accounting";
        draw(true);
        expect(screen.getByText("Site header")).toBeTruthy();
        expect(screen.getByText("Runs on Saroh")).toBeTruthy();
    });

    it("keeps them on /account while the area is switched off (its 404)", () => {
        pathname = "/account";
        draw(false);
        expect(screen.getByText("Site header")).toBeTruthy();
        expect(screen.getByText("Runs on Saroh")).toBeTruthy();
    });

    it("knows the account's addresses", () => {
        expect(isAccountPath("/account")).toBe(true);
        expect(isAccountPath("/account/me")).toBe(true);
        expect(isAccountPath("/accounts")).toBe(false);
        expect(isAccountPath("/book")).toBe(false);
    });
});
