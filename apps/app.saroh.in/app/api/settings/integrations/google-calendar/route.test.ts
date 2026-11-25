/**
 * Settings › Google Calendar's read route (DEC-259, U18): the person's own
 * accounts, or why they can't connect, to anyone in the business (the API
 * decides the rest). Switched off is a 404, a failed read a 503, and no
 * OAuth token crosses whatever the API sends.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
    active: "org_a" as string | null, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    business: null as unknown, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    read: null as unknown, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/google-calendar/service", () => ({
    readGoogleCalendar: () => Promise.resolve(h.read),
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: () => Promise.resolve(null),
}));

import { googleCalendarServer } from "@/lib/google-calendar/access";
import { prefetchRead } from "@/lib/query/prefetch";
import {
    expectAuthzMatrix,
    expectReadContract,
    makeTestClient,
    readRequest,
} from "@/lib/query/test-utils";

import * as route from "./route";

const MEMBER = { id: "org_a", name: "Rye", role: "MEMBER", actions: [] };
const STATUS = {
    state: "CONNECTED",
    pausedBecause: null,
    accounts: [
        {
            id: "ga_1",
            googleEmail: "asha@example.com",
            state: "CONNECTED",
            calendars: [
                { id: "cal_1", name: "Asha", writeTo: true, checkBusy: true },
            ],
            granted: {
                events: true,
                freeBusy: true,
                calendars: true,
                meet: true,
            },
            busyRefreshedAt: null,
            behind: false,
        },
    ],
    bookingsGoTo: {
        accountId: "ga_1",
        googleEmail: "asha@example.com",
        calendarId: "cal_1",
        name: "Asha",
    },
    accountsAllowed: 1,
    meetAccess: "RESTRICTED",
};
/** A leaky API: what a careless answer might carry. */
const LEAKY = {
    ...STATUS,
    accounts: [
        {
            ...STATUS.accounts[0],
            accessToken: "ya29.SECRET",
            refreshToken: "1//SECRET",
        },
    ],
};

const as = (who: unknown) => () => {
    h.active = "org_a";
    h.business = who;
    h.read = { kind: "ready", status: LEAKY };
};
const get = () =>
    route.GET(
        readRequest("/api/settings/integrations/google-calendar", {
            orgId: "org_a",
        }),
    );

beforeEach(() => as(MEMBER)());

describe("Google Calendar's read route", () => {
    it("answers what its service reads, field by field: no token in the JSON or the cache", async () => {
        await expectReadContract(googleCalendarServer, route.GET, "org_a", {});
        const body = (await (await get()).json()) as { status: unknown };
        expect(body).toEqual({ kind: "ready", status: STATUS, morePlan: null });
        const client = makeTestClient();
        await prefetchRead(client, googleCalendarServer, "org_a", {});
        const held = JSON.stringify(
            client
                .getQueryCache()
                .getAll()
                .map((q) => q.state.data),
        );
        expect(held).not.toMatch(/SECRET|Token/);
    });

    it("is anyone's in the business", async () => {
        await expectAuthzMatrix(
            {
                member: { as: as(MEMBER), status: 200 },
                "signed out": {
                    as: () => {
                        as(null)();
                        h.active = null;
                    },
                    status: 401,
                },
                "another business open in this tab": {
                    as: () => {
                        as(MEMBER)();
                        h.active = "org_b";
                    },
                    status: 409,
                },
            },
            get,
        );
    });

    it("says each refusal in its own words, is not found while off, and fails generically", async () => {
        for (const read of [
            { kind: "denied" },
            { kind: "plan", upgradeTo: { planId: "p", name: "Plan C" } },
            { kind: "off-diary", message: "Not on the diary." },
            { kind: "unavailable", message: "Not set up." },
        ]) {
            h.read = read;
            expect(await (await get()).json()).toEqual(read);
        }
        h.read = { kind: "off" };
        expect((await get()).status).toBe(404);
        h.read = { kind: "failed" };
        const failed = await get();
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ code: "unavailable" });
    });

    it("takes no params; only GET answers", async () => {
        const res = await route.GET(
            readRequest("/api/settings/integrations/google-calendar", {
                orgId: "org_a",
                params: { calendar: "connected" },
            }),
        );
        expect(res.status).toBe(400);
        expect((await route.POST()).status).toBe(405);
    });
});
