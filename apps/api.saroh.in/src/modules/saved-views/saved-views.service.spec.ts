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
});
