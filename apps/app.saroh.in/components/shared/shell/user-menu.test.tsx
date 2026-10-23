// @vitest-environment jsdom
/**
 * The account menu's way to Billing profiles (DEC-167 step 2, F9): for
 * someone who owns a business, "Billing profiles ↗" opens their account on
 * accounts.saroh.in in the same tab; for anyone else (an Admin or Member
 * only) it isn't there. The header decides it from the roles it has.
 *
 * And the business's Saroh contact (DEC-169, U26): the card shows only while
 * a manager is linked, above Help centre, and its Email action writes to the
 * work email the API gave. With no manager, nothing shows.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { billingProfilesUrl } from "@/lib/accounts";
import type { AccountManager, Organization } from "@/lib/organizations/service";

import { AppHeader } from "./app-header";
import type * as UserMenuModule from "./user-menu";
import { UserMenu } from "./user-menu";

vi.mock("@saroh/auth/client", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("next-themes", () => ({
    useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));
const menuProps = vi.hoisted(() => vi.fn());
vi.mock("./user-menu", async (actual) => {
    const real = await actual<typeof UserMenuModule>();
    return {
        UserMenu: (props: Parameters<typeof real.UserMenu>[0]) => {
            menuProps(props);
            return real.UserMenu(props);
        },
    };
});
vi.mock("@/components/organizations/switcher/organization-switcher", () => ({
    OrganizationSwitcher: () => null,
}));
vi.mock("@/components/shared/navigation/command-trigger", () => ({
    CommandTrigger: () => null,
}));
vi.mock("./notifications-link", () => ({
    NotificationsLink: () => null,
}));
vi.mock("./skin-switcher", () => ({
    SkinSwitcher: () => null,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    menuProps.mockReset();
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

async function openMenu(
    ownsABusiness: boolean,
    accountManager: AccountManager | null = null,
) {
    act(() =>
        root.render(
            <UserMenu
                name="Asha Verma"
                email="asha.verma@example.com"
                businessName="Pulse Fitness Gurugram"
                ownsABusiness={ownsABusiness}
                accountManager={accountManager}
            />,
        ),
    );
    const trigger = host.querySelector("button");
    if (!trigger) throw new Error("No menu button");
    await act(async () => {
        trigger.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
        await new Promise((r) => setTimeout(r, 20));
    });
    return document.body.querySelector("[role=menu]");
}

describe("Billing profiles in the account menu", () => {
    it("is there for an owner, opening their account in the same tab", async () => {
        const menu = await openMenu(true);
        const link = menu?.querySelector<HTMLAnchorElement>(
            "[data-billing-profiles-link]",
        );
        expect(link?.textContent).toContain("Billing profiles ↗");
        expect(link?.textContent).toContain("New");
        // accounts.saroh.in's address comes from the environment (CI sets
        // a local one), so compare with the one the menu is built from.
        expect(billingProfilesUrl).toMatch(/\/account\/billing-profiles$/);
        expect(link?.getAttribute("href")).toBe(billingProfilesUrl);
        expect(link?.hasAttribute("target")).toBe(false);
        expect(menu?.textContent).toContain(
            "Your profile and billing profiles are yours, not Pulse Fitness Gurugram's.",
        );
    });

    it("isn't there for someone who owns no business", async () => {
        const menu = await openMenu(false);
        expect(menu?.textContent).toContain("Your profile");
        expect(menu?.querySelector("[data-billing-profiles-link]")).toBeNull();
        expect(menu?.textContent).not.toContain("Billing profiles");
    });
});

describe("the header decides it from the roles", () => {
    const org = (id: string, role: Organization["role"]) =>
        ({ id, name: `Business ${id}`, role }) as Organization;

    it("an owner of any business gets it; an Admin or Member only doesn't", () => {
        const draw = (organizations: Organization[]) => {
            menuProps.mockReset();
            renderToStaticMarkup(
                <AppHeader
                    user={{ name: "Asha", email: "asha.verma@example.com" }}
                    organizations={organizations}
                    activeOrg={organizations[0] ?? null}
                    unread={null}
                />,
            );
            return (menuProps.mock.calls[0]?.[0] as { ownsABusiness?: boolean })
                .ownsABusiness;
        };
        expect(draw([org("a", "ADMIN"), org("b", "OWNER")])).toBe(true);
        expect(draw([org("a", "ADMIN")])).toBe(false);
        expect(draw([org("a", "MEMBER")])).toBe(false);
    });
});

describe("Your Saroh contact", () => {
    const meera: AccountManager = {
        name: "Meera Iyer",
        workEmail: "meera.iyer@example.com",
    };

    it("shows the manager's name and work email, with Email writing to it", async () => {
        const menu = await openMenu(true, meera);
        const card = menu?.querySelector("[data-saroh-contact]");
        expect(card?.textContent).toContain("Your Saroh contact");
        expect(card?.textContent).toContain("Meera Iyer");
        expect(card?.textContent).toContain("meera.iyer@example.com");
        const email = card?.querySelector<HTMLAnchorElement>("a");
        expect(email?.getAttribute("href")).toBe(
            "mailto:meera.iyer@example.com",
        );
        expect(email?.getAttribute("role")).toBe("menuitem");
        expect(email?.textContent).toContain("Email");
        expect(card?.textContent).not.toMatch(/\+91|phone/i);
    });

    it("sits above Help centre, and every other row is still there", async () => {
        const menu = await openMenu(true, meera);
        const text = menu?.textContent ?? "";
        expect(text.indexOf("Your Saroh contact")).toBeGreaterThan(-1);
        expect(text.indexOf("Your Saroh contact")).toBeLessThan(
            text.indexOf("Help centre"),
        );
        for (const row of [
            "Your profile",
            "Billing profiles",
            "Appearance",
            "Help centre",
            "Sign out",
        ]) {
            expect(text).toContain(row);
        }
    });

    it("with no work email, gives the name and nothing to press", async () => {
        const menu = await openMenu(false, { ...meera, workEmail: null });
        const card = menu?.querySelector("[data-saroh-contact]");
        expect(card?.textContent).toContain("Meera Iyer");
        expect(card?.querySelector("a")).toBeNull();
        expect(menu?.querySelector('a[href^="mailto:"]')).toBeNull();
    });

    it("isn't there without a manager", async () => {
        const menu = await openMenu(true, null);
        expect(menu?.textContent).toContain("Help centre");
        expect(menu?.querySelector("[data-saroh-contact]")).toBeNull();
        expect(menu?.textContent).not.toContain("Saroh contact");
        expect(menu?.querySelector('a[href^="mailto:"]')).toBeNull();
    });

    it("the header hands the active business's manager to the menu", () => {
        const org = {
            id: "a",
            name: "Business a",
            role: "OWNER",
        } as Organization;
        const handed = (accountManager?: AccountManager | null) => {
            menuProps.mockReset();
            renderToStaticMarkup(
                <AppHeader
                    user={{ name: "Asha", email: "asha.verma@example.com" }}
                    organizations={[org]}
                    activeOrg={org}
                    unread={null}
                    accountManager={accountManager}
                />,
            );
            return (
                menuProps.mock.calls[0]?.[0] as {
                    accountManager?: AccountManager | null;
                }
            ).accountManager;
        };
        expect(handed(meera)).toEqual(meera);
        expect(handed(null)).toBeNull();
        expect(handed(undefined)).toBeNull();
    });
});
