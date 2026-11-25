/**
 * Courses' read routes (DEC-259): each answers what its service gives
 * (`expectReadContract`); each has the Courses gate (`course:read` while
 * Courses is on); another business's course is a 404 and a param the read
 * doesn't take is a 400 that reads nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        module: string;
        course: ReturnType<typeof vi.fn<(id: string) => Promise<unknown>>>;
        list: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
        history: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
        holdings: ReturnType<
            typeof vi.fn<(id: string, plan: unknown) => Promise<unknown>>
        >;
    } => ({
        active: "org_a",
        business: null,
        module: "available",
        course: vi.fn<(id: string) => Promise<unknown>>(),
        list: vi.fn<() => Promise<unknown>>(),
        history: vi.fn<() => Promise<unknown>>(),
        holdings: vi.fn<(id: string, plan: unknown) => Promise<unknown>>(),
    }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
    resolveActiveOrganization: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/modules/guard", () => ({
    moduleAccess: () => Promise.resolve({ state: h.module }),
}));
vi.mock("@/lib/courses/service", () => ({
    getCourse: (id: string) => h.course(id),
    listCourses: () => h.list(),
}));
vi.mock("@/lib/price-history/service", () => ({
    readPriceHistory: () => h.history(),
}));
vi.mock("@/lib/contacts/holdings", () => ({
    loadContactHoldings: (id: string, plan: unknown) => h.holdings(id, plan),
}));

import {
    contactCoursesServer,
    courseServer,
    coursesListServer,
} from "@/lib/courses/access-server";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import * as courseRoute from "./[courseId]/route";
import * as contactRoute from "./contact/[contactId]/route";
import * as listRoute from "./route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["course:read", "course:write"],
};
const STAFF = { id: "org_a", role: "MEMBER", actions: ["course:read"] };
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["order:stage"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const COURSE = { id: "crs_1", name: "Wheel throwing", enrollments: [] };
const HISTORY = { entries: [], nextCursor: null };
const ENROLLMENT = { id: "enr_1", course: { id: "crs_1", name: "Wheel" } };

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.module = "available";
    h.course.mockReset();
    // The API's read: another business's course is not found.
    h.course.mockImplementation((id: string) =>
        Promise.resolve(id === "crs_1" ? COURSE : null),
    );
    h.list.mockReset().mockResolvedValue([COURSE]);
    h.history.mockReset().mockResolvedValue(HISTORY);
    h.holdings.mockReset().mockResolvedValue({
        courses: [ENROLLMENT],
        choices: { courses: [COURSE], gst: null },
    });
};

const getList = (params: Record<string, string> = {}) =>
    listRoute.GET(readRequest("/api/courses", { orgId: "org_a", params }));
const getCourse = (courseId: string, params: Record<string, string> = {}) =>
    courseRoute.GET(
        readRequest(`/api/courses/${courseId}`, { orgId: "org_a", params }),
        { params: Promise.resolve({ courseId }) },
    );
const getContact = (contactId: string) =>
    contactRoute.GET(
        readRequest(`/api/courses/contact/${contactId}`, { orgId: "org_a" }),
        { params: Promise.resolve({ contactId }) },
    );

const matrix = (get: () => Promise<Response>) =>
    expectAuthzMatrix(
        {
            owner: { as: as(OWNER), status: 200 },
            "staff who read courses": { as: as(STAFF), status: 200 },
            member: { as: as(MEMBER), status: 403 },
            reviewer: { as: as(REVIEWER), status: 403 },
            "Courses switched off": {
                as: () => {
                    as(OWNER)();
                    h.module = "unavailable";
                },
                status: 403,
            },
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
        get,
    );

beforeEach(() => as(OWNER)());

describe("/api/courses", () => {
    it("answers what its service gives", async () => {
        await expectReadContract(coursesListServer, listRoute.GET, "org_a", {});
        await expectReadContract(
            courseServer,
            courseRoute.GET,
            "org_a",
            { courseId: "crs_1" },
            { courseId: "crs_1" },
        );
        await expectReadContract(
            contactCoursesServer,
            contactRoute.GET,
            "org_a",
            { contactId: "c1" },
            { contactId: "c1" },
        );
    });

    it("a course comes with its price history; one that failed is null", async () => {
        expect(await (await getCourse("crs_1")).json()).toEqual({
            course: COURSE,
            priceHistory: HISTORY,
        });
        h.history.mockRejectedValue(new Error("down"));
        expect(await (await getCourse("crs_1")).json()).toEqual({
            course: COURSE,
            priceHistory: null,
        });
    });

    it("another business's course, or none, is a 404 with nothing in it", async () => {
        const res = await getCourse("crs_other");
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "not_found" });
    });

    it("a person's seats, and the open courses only to who may enrol", async () => {
        expect(await (await getContact("c1")).json()).toEqual({
            enrollments: [ENROLLMENT],
            open: [COURSE],
            gst: null,
        });
        expect(h.holdings.mock.lastCall).toMatchObject([
            "c1",
            { panels: ["courses"], canAct: { courses: true } },
        ]);
        as(STAFF)();
        await getContact("c1");
        expect(h.holdings.mock.lastCall).toMatchObject([
            "c1",
            { canAct: { courses: false } },
        ]);
    });

    it("is the Courses gate on each route", async () => {
        await matrix(() => getList());
        await matrix(() => getCourse("crs_1"));
        await matrix(() => getContact("c1"));
    });

    it("takes nothing else; a stray param is a 400 that reads nothing", async () => {
        expect((await getList({ q: "x" })).status).toBe(400);
        expect((await getCourse("crs_1", { courseId: "crs_2" })).status).toBe(
            400,
        );
        expect((await getCourse("../x")).status).toBe(400);
        expect(h.list).not.toHaveBeenCalled();
        expect(h.course).not.toHaveBeenCalled();
        expect((await listRoute.POST()).status).toBe(405);
    });
});
