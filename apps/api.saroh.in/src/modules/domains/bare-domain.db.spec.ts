/**
 * A bare domain against a real Postgres (DEC-140): typing one claims its
 * `www`, the check of the verified `www` domain stores where the bare
 * domain stands without touching whether the `www` site serves, and the
 * read says "added too" from the business's own domains only. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({ env: { NODE_ENV: "test" } }));

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { FakeBareDomainCheck } from "./bare-forwarding";
import { FakeDomainVerifier } from "./domain-verifier";
import { DomainsService } from "./domains.service";
import { FakeDomainHosting } from "./providers/fake-hosting";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const entitlements = {
    can: jest.fn().mockResolvedValue(true),
} as unknown as EntitlementService;

async function business(): Promise<OrganizationContext> {
    const owner = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com`, name: "Owner" },
    });
    const org = await prisma.organization.create({
        data: { name: "Rye", slug: uniq("rye") },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    return {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
    } as OrganizationContext;
}

describe("a bare domain (DEC-140)", () => {
    it("claims www, then stores where the bare domain stands at each check", async () => {
        const ctx = await business();
        const bare = `${uniq("shop")}.in`;
        const www = `www.${bare}`;
        const hosting = new FakeDomainHosting();
        const check = new FakeBareDomainCheck();
        const service = new DomainsService(
            new FakeDomainVerifier(true),
            entitlements,
            hosting,
            check,
        );

        const claimed = await service.claim(ctx, { hostname: bare });
        expect(claimed.domain.hostname).toBe(www);
        expect(claimed.domain.bare).toMatchObject({
            hostname: bare,
            forwardTo: `https://${www}`,
            state: null,
            added: false,
        });
        expect(
            await prisma.domain.findUnique({ where: { hostname: bare } }),
        ).toBeNull();

        // The TXT check passes: verified, registered, and the bare domain
        // looked at for the first time.
        const first = await service.verify(ctx, claimed.domain.id);
        expect(first.verified).toBe(true);
        expect(first.domain.bare?.state).toBe("NOT_FORWARDING");

        // Live, with forwarding set up over http only.
        const stored = await prisma.domain.findUniqueOrThrow({
            where: { id: claimed.domain.id },
        });
        hosting.set(stored.hostingId ?? "", "ACTIVE");
        check.setStatus(bare, "FORWARDS_HTTP_ONLY");
        const second = await service.verify(ctx, claimed.domain.id);
        expect(second.domain.hosting.state).toBe("LIVE");
        expect(second.domain.bare?.state).toBe("FORWARDS_HTTP_ONLY");

        // Forwarding stops: a notice on the row, and the www site stays live.
        check.setStatus(bare, "NOT_FORWARDING");
        const third = await service.verify(ctx, claimed.domain.id);
        expect(third.domain.hosting.state).toBe("LIVE");
        expect(third.domain.status).toBe("VERIFIED");
        const row = await prisma.domain.findUniqueOrThrow({
            where: { id: claimed.domain.id },
        });
        expect(row.bareStatus).toBe("NOT_FORWARDING");
        expect(row.bareCheckedAt).toBeInstanceOf(Date);
        expect(row.hostingStatus).toBe("ACTIVE");
    });

    it("keeps a bare domain whose DNS reaches the hosting, and says it was added too", async () => {
        const ctx = await business();
        const other = await business();
        const bare = `${uniq("studio")}.co.in`;
        const check = new FakeBareDomainCheck();
        const service = new DomainsService(
            new FakeDomainVerifier(),
            entitlements,
            null,
            check,
        );

        const www = await service.claim(ctx, { hostname: `www.${bare}` });
        expect(www.domain.bare?.added).toBe(false);

        // Not pointing yet: the bare domain would be claimed as www, which
        // this business already holds.
        await expect(
            service.claim(ctx, { hostname: bare }),
        ).rejects.toMatchObject({ status: 409 });

        check.setPointsHere(bare);
        const own = await service.claim(ctx, { hostname: bare });
        expect(own.domain.hostname).toBe(bare);
        expect(own.domain.hostnameKind).toBe("bare");

        const list = await service.list(ctx);
        expect(list.find((d) => d.hostname === `www.${bare}`)?.bare).toEqual(
            expect.objectContaining({ hostname: bare, added: true }),
        );
        // Another business never sees these domains, nor counts them.
        expect(await service.list(other)).toEqual([]);
    });
});
