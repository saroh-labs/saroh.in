/**
 * The shell's badges endpoint (owner, 25 Nov 2026): behind the session and
 * the business's own guards, never cached, the counts the service makes
 * for this person, and a role without notifications has none unread.
 */
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class OrganizationGuard {},
}));
jest.mock("../notifications/notifications.service", () => ({
    NotificationsService: class NotificationsService {},
}));
jest.mock("./home.service", () => ({ HomeService: class HomeService {} }));

import {
    GUARDS_METADATA,
    HEADERS_METADATA,
    PATH_METADATA,
} from "@nestjs/common/constants";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { NotificationsService } from "../notifications/notifications.service";
import { HomeController } from "./home.controller";
import type { HomeService } from "./home.service";

const CTX = {
    organizationId: "org_1",
    userId: "u_1",
    role: "MEMBER",
    roleKey: "MEMBER",
    actions: new Set(["lead:read"]),
    edition: "INDIA",
} as unknown as OrganizationContext;

function controller(unread: () => Promise<{ count: number }>) {
    const home = { badges: jest.fn().mockResolvedValue({ "/leads": 2 }) };
    const notifications = { unreadCount: jest.fn(unread) };
    return {
        home,
        notifications,
        c: new HomeController(
            home as unknown as HomeService,
            notifications as unknown as NotificationsService,
        ),
    };
}

describe("GET /organizations/:organizationId/home/badges", () => {
    it("is behind the session and business guards, and never cached", () => {
        const guards = (
            Reflect.getMetadata(GUARDS_METADATA, HomeController) as {
                name: string;
            }[]
        ).map((g) => g.name);
        expect(guards).toEqual(["BetterAuthGuard", "OrganizationGuard"]);
        const handler = HomeController.prototype.badges;
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe("badges");
        expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
            { name: "Cache-Control", value: "no-store" },
        ]);
    });

    it("counts for the guarded person: their business, role and permissions", async () => {
        const { c, home, notifications } = controller(() =>
            Promise.resolve({ count: 3 }),
        );
        expect(await c.badges(CTX)).toEqual({
            unread: 3,
            counts: { "/leads": 2 },
        });
        expect(notifications.unreadCount).toHaveBeenCalledWith(CTX);
        expect(home.badges).toHaveBeenCalledWith({
            organizationId: "org_1",
            userId: "u_1",
            organizationRole: "MEMBER",
            organizationRoleKey: "MEMBER",
            organizationActions: CTX.actions,
            edition: "INDIA",
        });
    });

    it("a role that can't see notifications has none unread", async () => {
        const { c } = controller(() =>
            Promise.reject(new Error("Your role can't see notifications.")),
        );
        expect((await c.badges(CTX)).unread).toBe(0);
    });
});
