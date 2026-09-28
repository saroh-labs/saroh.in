import { NotFoundException } from "@nestjs/common";

import { siteEmailChangedEmail } from "../../common/email";
import { env } from "../../env";
import { AccountAreaGuard, accountAreaOn } from "./account-area";
import { noteLabel } from "./account-home.service";
import type { AccountOffers, AccountTabKey } from "./account-tabs";
import { accountTabs, SHIPPED_ACCOUNT_TABS } from "./account-tabs";

/**
 * The account area's pure parts (round-2 plan A, A5): which tabs show, the
 * switch that keeps the area dark, a health note's tag and the "sign-in
 * email changed" notice.
 */

const ALL_SHIPPED: ReadonlySet<AccountTabKey> = new Set([
    "home",
    "bookings",
    "orders",
    "plan",
    "messages",
    "me",
]);

const clinic: AccountOffers = {
    appointments: true,
    orders: false,
    plans: false,
    messages: true,
    bookingsLabel: "Appointments",
};
const bakery: AccountOffers = {
    appointments: false,
    orders: true,
    plans: true,
    messages: true,
    bookingsLabel: "Appointments",
};

const keys = (offers: AccountOffers, shipped = ALL_SHIPPED) =>
    accountTabs(offers, shipped).map((t) => t.label);

describe("accountTabs", () => {
    it("a clinic sees Appointments; a bakery sees Orders and no Appointments", () => {
        expect(keys(clinic)).toEqual([
            "Home",
            "Appointments",
            "Messages",
            "Me",
        ]);
        expect(keys(bakery)).toEqual([
            "Home",
            "Orders",
            "Plan",
            "Messages",
            "Me",
        ]);
    });

    it("a gym that runs classes calls them Bookings", () => {
        expect(
            keys({ ...clinic, plans: true, bookingsLabel: "Bookings" }),
        ).toEqual(["Home", "Bookings", "Plan", "Messages", "Me"]);
    });

    it("shows a tab only once its page has shipped: Home and Me in A5", () => {
        expect([...SHIPPED_ACCOUNT_TABS]).toEqual(["home", "me"]);
        expect(accountTabs(clinic)).toEqual([
            { key: "home", label: "Home" },
            { key: "me", label: "Me" },
        ]);
        expect(accountTabs(bakery)).toEqual([
            { key: "home", label: "Home" },
            { key: "me", label: "Me" },
        ]);
    });
});

describe("the account area's switch (SITE_ACCOUNT_AREA)", () => {
    const original = env.SITE_ACCOUNT_AREA;
    afterEach(() => {
        env.SITE_ACCOUNT_AREA = original;
    });

    it("is off unless set to on, and the guard answers 404", () => {
        const guard = new AccountAreaGuard();
        for (const value of [undefined, "off"] as const) {
            env.SITE_ACCOUNT_AREA = value;
            expect(accountAreaOn()).toBe(false);
            expect(() => guard.canActivate()).toThrow(NotFoundException);
        }
        env.SITE_ACCOUNT_AREA = "on";
        expect(accountAreaOn()).toBe(true);
        expect(guard.canActivate()).toBe(true);
    });
});

describe("noteLabel", () => {
    it("keeps a short note whole", () => {
        expect(noteLabel("  Sore   left knee ")).toBe("Sore left knee");
    });

    it("cuts a long note on a word, within 60 characters", () => {
        const label = noteLabel(
            "I started taking blood thinners last week and my dentist in Pune said to tell you",
        );
        expect(label.length).toBeLessThanOrEqual(60);
        expect(label.endsWith("…")).toBe(true);
        expect(label).toBe(
            "I started taking blood thinners last week and my dentist…",
        );
    });
});

describe("the sign-in email changed notice", () => {
    it("escapes the business name and never names the new address", () => {
        const html = siteEmailChangedEmail('Kavi <b>"Dental"</b>');
        expect(html).toContain("Kavi &lt;b&gt;&quot;Dental&quot;&lt;/b&gt;");
        expect(html).not.toContain("<b>");
        expect(html).toContain("was just changed to another address");
        expect(html).toContain("If you didn't make this change");
        expect(html).not.toMatch(/@/);
    });
});
