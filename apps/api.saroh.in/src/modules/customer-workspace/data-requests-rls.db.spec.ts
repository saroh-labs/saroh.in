/**
 * Row-level security on customers' "Ask to remove my data" requests
 * (DEC-172, #1106): `CustomerDataRequest` carries the org-isolation policy
 * (ENABLEd and FORCEd in its migration), so a read with no organization
 * filter at all, in one business's context, sees none of another's.
 *
 * The probe needs the policies, which only the migrations build: it runs
 * with `TEST_RLS=on` (test/rls-mode.ts), as a NOBYPASSRLS role. The plain
 * run checks the service's own filter.
 */
import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import { DataRequestsService } from "./data-requests.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;

async function businessWithRequest(name: string) {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name, slug: `drls-${tag}-${seq}` },
    });
    const request = await prisma.customerDataRequest.create({
        data: {
            organizationId: org.id,
            requesterName: `${name} customer`,
            requesterEmail: `customer-${tag}-${seq}@example.com`,
        },
    });
    return { organizationId: org.id, requestId: request.id };
}

describe("another business's requests", () => {
    it("are never listed (the service's own filter)", async () => {
        const a = await businessWithRequest("Northwind");
        const b = await businessWithRequest("Rye");
        const user = await prisma.user.create({
            data: { email: `drls-owner-${tag}@example.com` },
        });
        const { requests } = await new DataRequestsService().list(
            {
                organizationId: a.organizationId,
                userId: user.id,
                role: "OWNER",
            },
            "all",
        );
        expect(requests.map((r) => r.id)).toEqual([a.requestId]);
        expect(requests.map((r) => r.id)).not.toContain(b.requestId);
    });
});

(isRlsTestMode() ? describe : describe.skip)(
    "row-level security (TEST_RLS=on)",
    () => {
        it("a read with no organization filter, in business A's context, sees none of B's", async () => {
            const a = await businessWithRequest("Northwind");
            const b = await businessWithRequest("Rye");

            const seen = await runInOrgContext(a.organizationId, () =>
                prisma.customerDataRequest.findMany({
                    select: { id: true, organizationId: true },
                }),
            );
            expect(seen.map((r) => r.organizationId)).toEqual([
                a.organizationId,
            ]);
            expect(
                await runInOrgContext(a.organizationId, () =>
                    prisma.customerDataRequest.count({
                        where: { id: b.requestId },
                    }),
                ),
            ).toBe(0);
            // Nor can A's context write a row into B.
            await expect(
                runInOrgContext(a.organizationId, () =>
                    prisma.customerDataRequest.create({
                        data: {
                            organizationId: b.organizationId,
                            requesterEmail: `stray-${tag}@example.com`,
                        },
                    }),
                ),
            ).rejects.toThrow();
        });
    },
);
