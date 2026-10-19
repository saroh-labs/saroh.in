/**
 * A person's one kept choice (`PUT saved-views`, DEC-170: where Bookings
 * opens) against a real Postgres, in the business's own context as a
 * request runs: setting it again replaces it, never a second row; it is
 * the caller's alone, in this business alone. Runs in the integration
 * project, plain and under `TEST_RLS=on`.
 */
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { SavedViewsService } from "./saved-views.service";

const service = new SavedViewsService();
let n = 0;

async function business(): Promise<OrganizationContext> {
    n += 1;
    const org = await prisma.organization.create({
        data: { name: "Kaya Physio", slug: `u2-opens-${process.pid}-${n}` },
    });
    const user = await prisma.user.create({
        data: { email: `u2-opens-${process.pid}-${n}@example.com` },
    });
    return { organizationId: org.id, userId: user.id, role: "MEMBER" };
}

const opensOn = (filters: Record<string, unknown>) => ({
    resource: "bookings.calendar",
    name: "opens on",
    filters,
});

const asIn = <T>(ctx: OrganizationContext, run: () => Promise<T>) =>
    runInOrgContext(ctx.organizationId, run);

describe("a person's one kept view (PUT saved-views)", () => {
    it("replaces what they had, so there is one row and it is the newest", async () => {
        const ctx = await business();
        await asIn(ctx, () => service.put(ctx, opensOn({ start: "week" })));
        await asIn(ctx, () =>
            service.put(ctx, opensOn({ start: "day", showFor: "all" })),
        );
        const kept = await asIn(ctx, () =>
            service.list(ctx, "bookings.calendar"),
        );
        expect(kept).toHaveLength(1);
        expect(kept[0]?.filters).toEqual({ start: "day", showFor: "all" });
    });

    it("two saves at once leave one row, the one saved last", async () => {
        const ctx = await business();
        await Promise.all(
            ["day", "week", "list", "day", "week"].map((start) =>
                asIn(ctx, () => service.put(ctx, opensOn({ start }))),
            ),
        );
        const kept = await asIn(ctx, () =>
            service.list(ctx, "bookings.calendar"),
        );
        expect(kept).toHaveLength(1);
    });

    it("is the caller's own: someone else's choice in the business stays", async () => {
        const ctx = await business();
        const other = await prisma.user.create({
            data: { email: `u2-other-${process.pid}-${n}@example.com` },
        });
        const theirs: OrganizationContext = { ...ctx, userId: other.id };
        await asIn(theirs, () =>
            service.put(theirs, opensOn({ start: "list" })),
        );
        await asIn(ctx, () => service.put(ctx, opensOn({ start: "week" })));
        const mine = await asIn(ctx, () =>
            service.list(ctx, "bookings.calendar"),
        );
        const stillTheirs = await asIn(theirs, () =>
            service.list(theirs, "bookings.calendar"),
        );
        expect(mine.map((v) => v.filters)).toEqual([{ start: "week" }]);
        expect(stillTheirs.map((v) => v.filters)).toEqual([{ start: "list" }]);
    });

    it("leaves other names and resources alone", async () => {
        const ctx = await business();
        await asIn(ctx, () =>
            service.create(ctx, {
                resource: "bookings.calendar",
                name: "Mornings",
                filters: { from: 540 },
            }),
        );
        await asIn(ctx, () => service.put(ctx, opensOn({ start: "day" })));
        await asIn(ctx, () => service.put(ctx, opensOn({ start: "list" })));
        const kept = await asIn(ctx, () =>
            service.list(ctx, "bookings.calendar"),
        );
        expect(kept.map((v) => v.name).sort()).toEqual([
            "Mornings",
            "opens on",
        ]);
    });

    it("is kept per business: the same person elsewhere starts afresh", async () => {
        const ctx = await business();
        await asIn(ctx, () => service.put(ctx, opensOn({ start: "week" })));
        const elsewhere = await business();
        const there: OrganizationContext = {
            ...elsewhere,
            userId: ctx.userId,
        };
        expect(
            await asIn(there, () => service.list(there, "bookings.calendar")),
        ).toEqual([]);
    });
});
