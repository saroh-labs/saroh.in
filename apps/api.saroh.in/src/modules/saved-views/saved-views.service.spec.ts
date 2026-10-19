import type { OrganizationContext } from "../../common/types/organization-context";
import { SavedViewsService } from "./saved-views.service";

const CTX: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "MEMBER",
};

function make() {
    const db = {
        savedView: {
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({ id: "v1" }),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    return { svc: new SavedViewsService(db as never), db };
}

describe("SavedViewsService", () => {
    it("lists only the caller's own views for the resource", async () => {
        const { svc, db } = make();
        await svc.list(CTX, "orders");
        expect(db.savedView.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    ownerUserId: "user_1",
                    resource: "orders",
                },
            }),
        );
    });

    it("creates a view owned by the actor and scoped to the org", async () => {
        const { svc, db } = make();
        await svc.create(CTX, {
            resource: "leads",
            name: "Hot",
            filters: { status: "OPEN" },
        });
        expect(db.savedView.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                ownerUserId: "user_1",
                resource: "leads",
                name: "Hot",
                filters: { status: "OPEN" },
            },
        });
    });

    it("deletes only the caller's own view (org + owner scoped)", async () => {
        const { svc, db } = make();
        await svc.remove(CTX, "v1");
        expect(db.savedView.deleteMany).toHaveBeenCalledWith({
            where: {
                id: "v1",
                organizationId: "org_1",
                ownerUserId: "user_1",
            },
        });
    });

    it("replaces the caller's one view by resource and name, in one transaction", async () => {
        const { svc, db } = make();
        const kept = await svc.put(CTX, {
            resource: "bookings.calendar",
            name: "opens on",
            filters: { start: "week" },
        });
        expect(kept).toEqual({ id: "v1" });
        expect(db.$transaction).toHaveBeenCalledTimes(1);
        expect(db.savedView.deleteMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                ownerUserId: "user_1",
                resource: "bookings.calendar",
                name: "opens on",
            },
        });
        expect(db.savedView.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                ownerUserId: "user_1",
                resource: "bookings.calendar",
                name: "opens on",
                filters: { start: "week" },
            },
        });
    });
});
