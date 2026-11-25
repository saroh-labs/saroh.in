/**
 * The inbox's read route (DEC-259): `/api/notifications` answers what its
 * service gives, as JSON; the API decides whose rows each person reads (its
 * 403 to a Reviewer is a 403 here); a row crosses with only what the inbox
 * draws, never its business, person or payload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const active: { id: string | null } = vi.hoisted(() => ({ id: "org_a" }));
const h = vi.hoisted(() => ({ refused: false }));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(active.id),
}));
const ROW = {
    id: "n1",
    type: "order.new",
    title: "New order ORD-012",
    body: null,
    leadId: null,
    reviewId: null,
    target: { kind: "order", id: "o1" },
    readAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    // What the API sends beside the row, and the inbox never draws.
    organizationId: "org_a",
    userId: "u_other",
    data: { secret: "x" },
};
vi.mock("@/lib/notifications/service", () => ({
    listNotifications: () => {
        // The API's 403 is `forbidden()`: Next's interrupt.
        if (h.refused) {
            throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;403"), {
                digest: "NEXT_HTTP_ERROR_FALLBACK;403",
            });
        }
        return Promise.resolve([ROW]);
    },
}));

import { notificationsServer } from "@/lib/notifications/access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET, POST } from "./route";

const as =
    (refused = false) =>
    () => {
        active.id = "org_a";
        h.refused = refused;
    };
const list = () => GET(readRequest("/api/notifications", { orgId: "org_a" }));

beforeEach(() => as()());

describe("/api/notifications", () => {
    it("answers what its service gives, as JSON", async () => {
        await expectReadContract(notificationsServer, GET, "org_a", {});
    });

    it("sends only what the inbox draws", async () => {
        expect(await (await list()).json()).toEqual([
            {
                id: "n1",
                type: "order.new",
                title: "New order ORD-012",
                body: null,
                leadId: null,
                reviewId: null,
                contactId: null,
                target: { kind: "order", id: "o1" },
                readAt: null,
                createdAt: "2026-11-01T00:00:00.000Z",
            },
        ]);
    });

    it("the API decides who reads; the tab's business must be the open one", async () => {
        await expectAuthzMatrix(
            {
                "owner or member": { as: as(), status: 200 },
                "a Reviewer, refused by the API": {
                    as: as(true),
                    status: 403,
                },
                "signed out": {
                    as: () => {
                        as()();
                        active.id = null;
                    },
                    status: 401,
                },
                "another business open in this tab": {
                    as: () => {
                        as()();
                        active.id = "org_b";
                    },
                    status: 409,
                },
            },
            list,
        );
    });

    it("takes no params and only GET", async () => {
        const res = await GET(
            readRequest("/api/notifications", {
                orgId: "org_a",
                params: { unread: "true" },
            }),
        );
        expect(res.status).toBe(400);
        expect((await POST()).status).toBe(405);
    });
});
