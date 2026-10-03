/**
 * The address rules against a real Postgres (DEC-069, L1): an address a
 * business held before a change is taken for everyone else until its
 * `reservedUntil`, free to itself, and free to all after; `releaseExpired`
 * clears only a hold that has run out. Under `TEST_RLS=on`, one business
 * cannot list another's holds in its own context, yet "is it free" still
 * sees them there.
 */
import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import { addressTaken, freeAddress, releaseExpired } from "./site-address";

const DAY = 86_400_000;
const tag = `${process.pid}-${Date.now()}`;
let n = 0;

async function business() {
    n += 1;
    return prisma.organization.create({
        data: { name: `Held ${n}`, slug: `held-${tag}-${n}` },
        select: { id: true },
    });
}

function hold(organizationId: string, address: string, reservedUntil: Date) {
    return prisma.addressReservation.create({
        data: {
            organizationId,
            address,
            reservedUntil,
            redirectUntil: reservedUntil,
        },
    });
}

describe("an address held after a change", () => {
    it("is taken for another business while it lasts, and free a day after", async () => {
        const a = await business();
        const b = await business();
        const address = `rye-${tag}-live`;
        const row = await hold(b.id, address, new Date(Date.now() + DAY));

        await expect(addressTaken(prisma, address, a.id)).resolves.toBe(true);
        await expect(addressTaken(prisma, address)).resolves.toBe(true);
        await expect(freeAddress(prisma, address, a.id)).resolves.toBe(
            `${address}-2`,
        );

        await prisma.addressReservation.update({
            where: { id: row.id },
            data: { reservedUntil: new Date(Date.now() - DAY) },
        });
        await expect(addressTaken(prisma, address, a.id)).resolves.toBe(false);
        await expect(freeAddress(prisma, address, a.id)).resolves.toBe(address);
    });

    it("is free to the business that holds it", async () => {
        const a = await business();
        const address = `rye-${tag}-own`;
        await hold(a.id, address, new Date(Date.now() + DAY));

        await expect(addressTaken(prisma, address, a.id)).resolves.toBe(false);
        await expect(freeAddress(prisma, address, a.id)).resolves.toBe(address);
    });
});

describe("releaseExpired", () => {
    it("deletes a hold that has run out and leaves a live one", async () => {
        const a = await business();
        const gone = `rye-${tag}-gone`;
        const live = `rye-${tag}-kept`;
        await hold(a.id, gone, new Date(Date.now() - DAY));
        await hold(a.id, live, new Date(Date.now() + DAY));

        await expect(releaseExpired(prisma, gone)).resolves.toBe(1);
        await expect(releaseExpired(prisma, live)).resolves.toBe(0);
        await expect(releaseExpired(prisma, `rye-${tag}-none`)).resolves.toBe(
            0,
        );

        const left = await prisma.addressReservation.findMany({
            where: { address: { in: [gone, live] } },
            select: { address: true },
        });
        expect(left.map((r) => r.address)).toEqual([live]);
    });

    it("works inside the claimer's transaction", async () => {
        const a = await business();
        const address = `rye-${tag}-tx`;
        await hold(a.id, address, new Date(Date.now() - DAY));

        const count = await prisma.$transaction((tx) =>
            releaseExpired(tx, address),
        );
        expect(count).toBe(1);
    });
});

const describeRls = isRlsTestMode() ? describe : describe.skip;

describeRls("row-level security (TEST_RLS=on)", () => {
    it("keeps one business's holds out of another's list, yet counts them as taken", async () => {
        const a = await business();
        const b = await business();
        const address = `rye-${tag}-rls`;
        await hold(b.id, address, new Date(Date.now() + DAY));
        await hold(a.id, `rye-${tag}-rls-a`, new Date(Date.now() + DAY));

        const seenByA = await runInOrgContext(a.id, () =>
            prisma.addressReservation.findMany({
                select: { organizationId: true },
            }),
        );
        expect(seenByA.length).toBeGreaterThan(0);
        expect(seenByA.every((r) => r.organizationId === a.id)).toBe(true);

        // "Is it free" is asked during A's own request, and must still see B.
        await expect(
            runInOrgContext(a.id, () => addressTaken(prisma, address, a.id)),
        ).resolves.toBe(true);
        await expect(
            runInOrgContext(a.id, () =>
                prisma.$transaction((tx) => addressTaken(tx, address, a.id)),
            ),
        ).resolves.toBe(true);
    });
});
