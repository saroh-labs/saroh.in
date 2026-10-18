// @vitest-environment jsdom
/**
 * The account menu's way to Billing profiles (DEC-167 step 2, F9): for
 * someone who owns a business, "Billing profiles ↗" opens their account on
 * accounts.saroh.in in the same tab; for anyone else (an Admin or Member
 * only) it isn't there. The header decides it from the roles it has.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Organization } from "@/lib/organizations/service";

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
vi.mock("@/components/organizations/organization-switcher", () => ({
    OrganizationSwitcher: () => null,
}));
vi.mock("@/components/shared/command-trigger", () => ({
    CommandTrigger: () => null,
}));
vi.mock("@/components/shared/notifications-link", () => ({
    NotificationsLink: () => null,
}));
vi.mock("@/components/shared/skin-switcher", () => ({
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

async function openMenu(ownsABusiness: boolean) {
    act(() =>
        root.render(
            <UserMenu
                name="Asha Verma"
                email="asha.verma@example.com"
                businessName="Pulse Fitness Gurugram"
                ownsABusiness={ownsABusiness}
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
        expect(link?.getAttribute("href")).toBe(
            "https://accounts.saroh.in/account/billing-profiles",
        );
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
