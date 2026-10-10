import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    cookieValue,
    decodeJoined,
    encodeJoined,
    joinDoor,
    JOINED_COOKIE,
    joinedLine,
    locationArrival,
    roleOpens,
    safeArrival,
} from "./joined";

/**
 * A new team member is told where they are (UX audit, 10 Oct), and an
 * accepted invitation, a location's included, opens the right business.
 */

describe("joinedLine: which business, as what, and what that opens", () => {
    it.each([
        [
            { role: "OWNER" },
            "You've joined Rye & Co. as Owner. You can do everything here, including the plan and who has access.",
        ],
        [
            { role: "ADMIN" },
            "You've joined Rye & Co. as Admin. You can change the business and invite people.",
        ],
        [
            { role: "MEMBER", roleKey: "MEMBER" },
            "You've joined Rye & Co. as Member. You can see its bookings, contacts and orders, and move orders along.",
        ],
        [
            { role: "REVIEWER" },
            "You've joined Rye & Co. as Reviewer. You can read and comment on the pages you were asked to look at.",
        ],
    ])("%o", (as, line) => {
        expect(joinedLine({ name: "Rye & Co.", ...as })).toBe(line);
    });

    it("calls a location's team by its name on screen, never storefront", () => {
        const line = joinedLine({
            name: "Rye & Co.",
            role: "MEMBER",
            roleKey: "storefront-team",
            roleLabel: "Storefront team",
        });
        expect(line).toBe(
            "You've joined Rye & Co. as Location team. You can work the orders at the locations you were added to.",
        );
        expect(line).not.toMatch(/storefront/i);
    });

    it("says what Calendar only opens", () => {
        expect(
            joinedLine({
                name: "Kavi Dental",
                role: "MEMBER",
                roleKey: "calendar-only",
                roleLabel: "Calendar only",
            }),
        ).toBe(
            "You've joined Kavi Dental as Calendar only. You can see and change your own bookings.",
        );
    });

    it("names a role the business made, and points at the menu rather than guess", () => {
        expect(
            joinedLine({
                name: "Rye & Co.",
                role: "MEMBER",
                roleKey: "front-desk",
                roleLabel: "Front desk",
            }),
        ).toBe(
            "You've joined Rye & Co. as Front desk. Your menu shows what this role opens.",
        );
        // A made role maps to MEMBER, and is never described as one.
        expect(roleOpens({ role: "MEMBER", roleKey: "front-desk" })).toBe(
            "Your menu shows what this role opens.",
        );
    });

    it("has no long dash and no semicolon", () => {
        for (const role of ["OWNER", "ADMIN", "MEMBER", "REVIEWER"]) {
            expect(joinedLine({ name: "Rye", role })).not.toMatch(/[—;]/);
        }
    });
});

describe("the cookie that carries the line across the redirect", () => {
    const line = joinedLine({ name: "Rye & Co.", role: "REVIEWER" });

    it("round-trips a line", () => {
        expect(decodeJoined(encodeJoined(line))).toBe(line);
    });

    it("shows nothing that is not a line of this kind", () => {
        expect(decodeJoined(null)).toBeNull();
        expect(decodeJoined("")).toBeNull();
        expect(decodeJoined(encodeURIComponent("Send money to…"))).toBeNull();
        expect(decodeJoined("%E0%A4%A")).toBeNull();
        expect(
            decodeJoined(
                encodeURIComponent(`You've joined ${"x".repeat(400)}`),
            ),
        ).toBeNull();
    });

    it("finds its value among the page's cookies", () => {
        const all = `theme=dark; ${JOINED_COOKIE}=${encodeJoined(line)}; other=1`;
        expect(decodeJoined(cookieValue(all, JOINED_COOKIE))).toBe(line);
        expect(cookieValue("theme=dark", JOINED_COOKIE)).toBeNull();
    });
});

describe("where the door may send someone", () => {
    it("follows a path in this app", () => {
        expect(safeArrival("/sites/site_1")).toBe("/sites/site_1");
        expect(safeArrival("/commerce/orders?storefront=s1")).toBe(
            "/commerce/orders?storefront=s1",
        );
    });

    it("never leaves the app", () => {
        expect(safeArrival("https://evil.example")).toBe("/");
        expect(safeArrival("//evil.example")).toBe("/");
        expect(safeArrival("/\\evil.example")).toBe("/");
        expect(safeArrival("javascript:alert(1)")).toBe("/");
        expect(safeArrival("/a\r\nSet-Cookie: x=1")).toBe("/");
        expect(safeArrival(null)).toBe("/");
        expect(safeArrival("")).toBe("/");
    });

    it("builds the door for an accepted invitation", () => {
        expect(joinDoor("org_1", "/sites/site 1")).toBe(
            "/open/org_1?joined=1&to=%2Fsites%2Fsite+1",
        );
    });

    it("lands a location's invitation on that location's orders", () => {
        expect(locationArrival("store_hill")).toBe(
            "/commerce/orders?storefront=store_hill",
        );
    });
});

/** The door itself, and the two pages that send people through it. */
const setActiveOrganization = vi.fn();
vi.mock("@/lib/organizations/actions", () => ({
    setActiveOrganization: (...args: unknown[]) =>
        setActiveOrganization(...args) as unknown,
}));
const jar = { set: vi.fn() };
vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve(jar),
    headers: () => Promise.resolve(new Headers()),
}));
class Redirected extends Error {
    constructor(readonly to: string) {
        super(`redirect:${to}`);
    }
}
vi.mock("next/navigation", () => ({
    redirect: (to: string) => {
        throw new Redirected(to);
    },
}));
vi.mock("@/env", () => ({ env: { NODE_ENV: "test" } }));
const requireSession = vi.fn();
vi.mock("@/lib/session", () => ({
    requireSession: (...args: unknown[]) => requireSession(...args) as unknown,
}));
const acceptBusiness = vi.fn();
vi.mock("@/lib/organizations/members", () => ({
    acceptInvitation: (...args: unknown[]) =>
        acceptBusiness(...args) as unknown,
    invitedEmail: vi.fn(),
}));
const acceptLocation = vi.fn();
vi.mock("@/lib/members/service", () => ({
    acceptInvitation: (...args: unknown[]) =>
        acceptLocation(...args) as unknown,
}));
vi.mock("@/lib/accounts", () => ({ inviteLandingFor: () => null }));
vi.mock("@/components/organizations/invitation-problem", () => ({
    InvitationProblemView: () => null,
}));

async function landing(run: () => Promise<unknown>): Promise<string> {
    try {
        await run();
    } catch (error) {
        if (error instanceof Redirected) return error.to;
        throw error;
    }
    throw new Error("It did not redirect");
}

const open = async (id: string, query = "") => {
    const { GET } = await import("@/app/open/[organizationId]/route");
    return landing(() =>
        GET(new Request(`https://app.saroh.in/open/${id}${query}`), {
            params: Promise.resolve({ organizationId: id }),
        }),
    );
};

describe("the door: /open/:id", () => {
    beforeEach(() => {
        setActiveOrganization.mockReset();
        jar.set.mockReset();
        setActiveOrganization.mockResolvedValue({
            ok: true,
            data: {
                id: "org_1",
                name: "Rye & Co.",
                role: "REVIEWER",
                roleKey: "REVIEWER",
                roleLabel: null,
            },
        });
    });

    it("opens the business and goes Home, as it always did", async () => {
        expect(await open("org_1")).toBe("/");
        expect(setActiveOrganization).toHaveBeenCalledWith("org_1");
        // No invitation: nothing is said.
        expect(jar.set).not.toHaveBeenCalled();
    });

    it("after an invitation: opens the business, leaves the line, and goes on", async () => {
        expect(await open("org_1", "?joined=1&to=%2Fsites%2Fsite_1")).toBe(
            "/sites/site_1",
        );
        expect(jar.set).toHaveBeenCalledTimes(1);
        const [name, value, options] = jar.set.mock.calls[0] as [
            string,
            string,
            { maxAge: number; httpOnly: boolean; path: string },
        ];
        expect(name).toBe(JOINED_COOKIE);
        expect(decodeJoined(value)).toBe(
            "You've joined Rye & Co. as Reviewer. You can read and comment on the pages you were asked to look at.",
        );
        // Short-lived, and readable by the page that shows it once.
        expect(options).toMatchObject({
            maxAge: 60,
            httpOnly: false,
            path: "/",
        });
    });

    it("never follows a way out of the app", async () => {
        expect(
            await open("org_1", "?joined=1&to=https%3A%2F%2Fevil.example"),
        ).toBe("/");
    });

    it("a business that isn't theirs is refused, and nothing is said", async () => {
        setActiveOrganization.mockResolvedValue({
            ok: false,
            error: "You aren't in that business.",
        });
        const to = await open("org_x", "?joined=1&to=%2Fsites%2Fsite_1");
        expect(to).not.toBe("/sites/site_1");
        expect(to).toContain("/choose");
        expect(jar.set).not.toHaveBeenCalled();
    });
});

describe("accepting an invitation arrives through the door", () => {
    beforeEach(() => {
        requireSession.mockResolvedValue({
            user: { email: "ravi@example.com" },
        });
        acceptBusiness.mockReset();
        acceptLocation.mockReset();
    });

    const join = async () => {
        const { default: JoinPage } =
            await import("@/app/(shell)/join/[token]/page");
        return landing(() =>
            JoinPage({ params: Promise.resolve({ token: "tok" }) }),
        );
    };
    const joinLocation = async () => {
        const { default: Page } =
            await import("@/app/(shell)/invitations/[token]/page");
        return landing(() =>
            Page({ params: Promise.resolve({ token: "tok" }) }),
        );
    };

    it("a business's invitation opens that business, then Home", async () => {
        acceptBusiness.mockResolvedValue({
            ok: true,
            data: { organizationId: "org_1", siteId: null },
        });
        expect(await join()).toBe("/open/org_1?joined=1&to=%2F");
    });

    it("a reviewer goes on to the site they were asked to look at", async () => {
        acceptBusiness.mockResolvedValue({
            ok: true,
            data: { organizationId: "org_1", siteId: "site_1" },
        });
        expect(await join()).toBe("/open/org_1?joined=1&to=%2Fsites%2Fsite_1");
    });

    it("a location's invitation switches to its business, and lands on that location's orders", async () => {
        acceptLocation.mockResolvedValue({
            ok: true,
            data: { storeId: "store_hill", organizationId: "org_1" },
        });
        const to = await joinLocation();
        expect(to).toBe(
            "/open/org_1?joined=1&to=%2Fcommerce%2Forders%3Fstorefront%3Dstore_hill",
        );
        // Not the location's own settings, which their menu never lists.
        expect(decodeURIComponent(to)).not.toContain("/commerce/locations");
    });

    it("an API that doesn't name the business still lands on the orders", async () => {
        acceptLocation.mockResolvedValue({
            ok: true,
            data: { storeId: "store_hill", organizationId: null },
        });
        expect(await joinLocation()).toBe(
            "/commerce/orders?storefront=store_hill",
        );
    });
});
