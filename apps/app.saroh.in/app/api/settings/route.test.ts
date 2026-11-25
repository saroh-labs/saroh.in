/**
 * Settings' read routes (DEC-259): Team, Your profile and Business. The
 * service and each route answer the same JSON; each goes to whoever
 * may open that tab, and to nobody else (Business to owners and admins,
 * never a Member). Team carries each person, invitation and calendar
 * account as the facts its row draws: no token, invitation link or
 * credential reaches the route's JSON or the browser's cache, whatever the
 * API sends.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = {
    id: string;
    name?: string;
    kind?: string;
    role?: string;
    actions?: string[];
} | null;
type Fn = ReturnType<typeof vi.fn<(...a: unknown[]) => Promise<unknown>>>;
const fn = () => vi.fn<(...a: unknown[]) => Promise<unknown>>();
const h = vi.hoisted(() => ({
    active: "org_a" as string | null, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    business: null as Business,
    members: null as unknown as Fn,
    invitations: null as unknown as Fn,
    calendar: null as unknown as Fn,
    settings: null as unknown as Fn,
    alerts: null as unknown as Fn,
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/session", () => ({
    requireSession: () =>
        Promise.resolve({
            user: { name: "Asha ", email: "asha@example.com" },
            token: "session-secret",
        }),
}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/lib/organizations/members", () => ({
    listMembers: () => h.members(),
    listInvitations: () => h.invitations(),
    getStorefrontTeamNotice: () => Promise.resolve([]),
}));
vi.mock("@/lib/sites/service", () => ({
    listSites: () => Promise.resolve([{ id: "s1", name: "Rye", extra: 1 }]),
}));
vi.mock("@/lib/organizations/roles", () => ({
    listRoles: () => Promise.resolve([]),
    getRoleCatalogue: () => Promise.resolve(null),
}));
vi.mock("@/lib/modules/guard", () => ({
    modulesOrUnknown: () => Promise.resolve(null),
}));
vi.mock("@/lib/staff/service", () => ({
    listStaff: () => Promise.resolve({ staff: [] }),
    readMyStaff: () => Promise.resolve(null),
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: () => Promise.resolve(null),
    pausedOrNull: () => Promise.resolve(null),
}));
vi.mock("@/lib/google-calendar/service", () => ({
    readCalendarMembers: () => h.calendar(),
}));
vi.mock("@/lib/notifications/service", () => ({
    getAlertPreferences: () => h.alerts(),
}));
vi.mock("@/lib/usage-sharing/service", () => ({
    usageSharingOrNull: () => Promise.resolve(null),
}));
vi.mock("@/lib/organizations/settings-service", () => ({
    getOrganizationSettings: () => h.settings(),
}));
vi.mock("@/lib/organizations/web-address-service", () => ({
    readWebAddress: () => Promise.resolve({ ok: false, missing: true }),
}));
vi.mock("@/lib/stores/storefronts", () => ({
    listStorefrontHours: () => Promise.resolve({ state: "sell-off" }),
}));
vi.mock("@/lib/settings/ready-service", () => ({
    loadSettingsChecklist: () =>
        Promise.resolve({
            steps: [],
            left: [],
            done: 0,
            total: 0,
            outside: [],
        }),
}));

import { prefetchRead } from "@/lib/query/prefetch";
import {
    expectAuthzMatrix,
    expectReadContract,
    makeTestClient,
    readRequest,
} from "@/lib/query/test-utils";
import {
    organizationServer,
    peopleServer,
    profileServer,
} from "@/lib/settings/access";

import * as orgRoute from "./organization/route";
import * as peopleRoute from "./people/route";
import * as profileRoute from "./profile/route";

const all = (role: string, actions: string[]) => ({
    id: "org_a",
    name: "Rye",
    kind: "BUSINESS",
    role,
    actions,
});
const OWNER = all("OWNER", [
    "member:read",
    "member:invite",
    "member:role:update",
    "org:settings:read",
    "org:update",
]);
const ADMIN = all("ADMIN", [
    "member:read",
    "member:invite",
    "org:settings:read",
]);
const MEMBER = all("MEMBER", ["member:read"]);
const REVIEWER = all("REVIEWER", ["site:review"]);

/** What Team draws of a person and an invitation. */
const PERSON = {
    userId: "u1",
    name: "Asha",
    email: "asha@example.com",
    role: "OWNER",
    siteIds: [],
    isSelf: true,
    lastActiveAt: null,
};
const INVITE = {
    id: "i1",
    email: "new@example.com",
    role: "MEMBER",
    roleKey: "MEMBER",
    siteIds: [],
    status: "PENDING",
    expiresAt: "2099-12-01",
    createdAt: "2099-11-01",
    staff: null,
    countedOnDiary: false,
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.members = fn().mockResolvedValue([
        { ...PERSON, passwordHash: "x", sessionToken: "t" },
    ]);
    h.invitations = fn().mockResolvedValue([
        { ...INVITE, token: "invite-secret", tokenHash: "abc" },
    ]);
    h.calendar = fn().mockResolvedValue([
        {
            membershipId: "m1",
            staffId: null,
            name: "Asha",
            accounts: [
                {
                    id: "g1",
                    googleEmail: "asha@example.com",
                    state: "CONNECTED",
                    refreshToken: "1//secret",
                    accessToken: "ya29.secret",
                },
            ],
            bookingsGoToGoogle: true,
            pausedBecause: null,
        },
    ]);
    h.settings = fn().mockResolvedValue({
        id: "org_a",
        slug: "rye",
        name: "Rye",
    });
    h.alerts = fn().mockResolvedValue({ status: "unavailable" });
};

beforeEach(() => as(OWNER)());

const ROUTES = {
    "/api/settings/people": peopleRoute.GET,
    "/api/settings/profile": profileRoute.GET,
    "/api/settings/organization": orgRoute.GET,
} as const;

function keysOf(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(keysOf);
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
    }
    return [];
}
const SECRET = /token|secret|hash|password|credential/i;

describe("/api/settings/*", () => {
    it("answers what its service reads", async () => {
        await expectReadContract(peopleServer, peopleRoute.GET, "org_a", {});
        await expectReadContract(profileServer, profileRoute.GET, "org_a", {});
        await expectReadContract(organizationServer, orgRoute.GET, "org_a", {});
    });

    it("carries people, invitations and calendar accounts as facts: no token, hash or session in the route's JSON or the cache", async () => {
        const res = await peopleRoute.GET(
            readRequest("/api/settings/people", { orgId: "org_a" }),
        );
        const body = (await res.json()) as {
            members: unknown[];
            invitations: unknown[];
        };
        expect(body.members).toEqual([PERSON]);
        expect(body.invitations).toEqual([INVITE]);
        expect(keysOf(body).filter((k) => SECRET.test(k))).toEqual([]);

        // What a query holds is the service's answer as the wire carries it.
        const client = makeTestClient();
        await prefetchRead(client, peopleServer, "org_a", {});
        await prefetchRead(client, profileServer, "org_a", {});
        const held = client
            .getQueryCache()
            .getAll()
            .map((q) => q.state.data);
        expect(held).toHaveLength(2);
        expect(JSON.stringify(held)).not.toMatch(/secret|ya29|1\/\//);
        expect(keysOf(held).filter((k) => SECRET.test(k))).toEqual([]);
    });

    it("says what each role may change, as the pages did", async () => {
        const read = async () =>
            (await (
                await peopleRoute.GET(
                    readRequest("/api/settings/people", { orgId: "org_a" }),
                )
            ).json()) as {
                canManage: boolean;
                canEditRoles: boolean;
                invitations: unknown[];
                calendar: unknown;
            };
        const owner = await read();
        expect([owner.canManage, owner.canEditRoles]).toEqual([true, true]);
        as(MEMBER)();
        const member = await read();
        expect(member).toMatchObject({
            canManage: false,
            canEditRoles: false,
            invitations: [],
            calendar: null,
        });
        // A member never asks for the invitations or the calendar accounts.
        expect(h.invitations).not.toHaveBeenCalled();
        expect(h.calendar).not.toHaveBeenCalled();
    });

    it("is each tab's gate: Business to owners and admins only, Team to member:read, Your profile to everyone in it", async () => {
        const matrix = (people: number, profile: number, org: number) => ({
            people,
            profile,
            org,
        });
        const want = {
            owner: matrix(200, 200, 200),
            admin: matrix(200, 200, 200),
            member: matrix(200, 200, 403),
            reviewer: matrix(403, 200, 403),
        };
        for (const [path, GET] of Object.entries(ROUTES)) {
            const col = path.endsWith("people")
                ? "people"
                : path.endsWith("profile")
                  ? "profile"
                  : "org";
            await expectAuthzMatrix(
                {
                    owner: { as: as(OWNER), status: want.owner[col] },
                    admin: { as: as(ADMIN), status: want.admin[col] },
                    member: { as: as(MEMBER), status: want.member[col] },
                    reviewer: { as: as(REVIEWER), status: want.reviewer[col] },
                    "signed out": {
                        as: () => {
                            as(null)();
                            h.active = null;
                        },
                        status: 401,
                    },
                    "another business open in this tab": {
                        as: () => {
                            as(OWNER)();
                            h.active = "org_b";
                        },
                        status: 409,
                    },
                },
                () => GET(readRequest(path, { orgId: "org_a" })),
            );
        }
    });

    it("takes no params; a failed read is a generic failure; only GET answers", async () => {
        for (const [path, GET] of Object.entries(ROUTES)) {
            const res = await GET(
                readRequest(path, { orgId: "org_a", params: { tab: "roles" } }),
            );
            expect(res.status, path).toBe(400);
        }
        expect(h.members).not.toHaveBeenCalled();
        h.members.mockRejectedValue(new Error("down"));
        const failed = await peopleRoute.GET(
            readRequest("/api/settings/people", { orgId: "org_a" }),
        );
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ code: "unavailable" });
        expect((await orgRoute.POST()).status).toBe(405);
    });
});
