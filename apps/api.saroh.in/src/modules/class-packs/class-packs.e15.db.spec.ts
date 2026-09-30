/**
 * Round-2 E15 against a real Postgres: what the Packs list's cards read —
 * sold, still to use across how many people, and what each pack has taken —
 * with drafts listed only when the Packs screen asks for them. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "../invoices/invoices.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { ClassPacksService } from "./class-packs.service";

const packs = new ClassPacksService(new InvoicesService());

const DAY = 86_400_000;
let owner: OrganizationContext;
let deskReader: OrganizationContext;
let hiit: string;
let people = 0;
let made = 0;

async function person(): Promise<string> {
    people += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `e15-${people}-${process.pid}@example.com`,
                firstName: `Holder${people}`,
            },
        })
    ).id;
}

async function classesPack(over: Record<string, unknown> = {}) {
    made += 1;
    return packs.createPack(owner, {
        name: `Classes ${made}`,
        credits: 5,
        validityDays: 60,
        price: "2200",
        currency: "INR",
        serviceIds: [hiit],
        ...over,
    });
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Pulse E15", slug: `e15-${process.pid}` },
    });
    await giveBusinessDetails(org.id);
    const neha = await prisma.user.create({
        data: { email: `e15-neha-${process.pid}@example.com`, name: "Neha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: neha.id, role: "OWNER" },
    });
    owner = { organizationId: org.id, userId: neha.id, role: "OWNER" };
    const desk = await prisma.user.create({
        data: { email: `e15-desk-${process.pid}@example.com`, name: "Desk" },
    });
    // Reads packs, and nothing about payments or invoices (DEC-039).
    deskReader = {
        organizationId: org.id,
        userId: desk.id,
        role: "MEMBER",
        roleKey: "front-desk",
        actions: resolveCapabilities("front-desk", ["pack:read"]),
    };
    hiit = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "HIIT",
                durationMinutes: 60,
                capacity: 20,
                timezone: "UTC",
                status: "ACTIVE",
            },
        })
    ).id;
});

describe("the Packs list's cards (E15)", () => {
    it("counts people once, leaves out expired holders, and sums what it took", async () => {
        const pack = await classesPack();
        const twice = await person();
        const expired = await person();
        await packs.sell(owner, pack.id, { contactId: twice, paidBy: "CASH" });
        await packs.sell(owner, pack.id, { contactId: twice, paidBy: "UPI" });
        const gone = await packs.sell(owner, pack.id, {
            contactId: expired,
            paidBy: "NONE",
        });
        await prisma.packPurchase.update({
            where: { id: gone.id },
            data: { expiresAt: new Date(Date.now() - DAY) },
        });

        const card = (await packs.listPacks(deskReader, {})).find(
            (p) => p.id === pack.id,
        );
        expect(card).toMatchObject({
            sold: 3,
            activeHolders: 2,
            people: 1,
            creditsLeft: 10,
            // pack:read covers the money, without payment:read (DEC-039).
            takings: [{ currency: "INR", amount: "6600.00" }],
        });
    });

    it("a pack never sold reads nothing sold, nobody holding it, nothing taken", async () => {
        const pack = await classesPack();
        const card = (await packs.listPacks(owner, {})).find(
            (p) => p.id === pack.id,
        );
        expect(card).toMatchObject({
            sold: 0,
            activeHolders: 0,
            people: 0,
            creditsLeft: 0,
            takings: [],
        });
    });

    it("a draft shows only when the list asks for drafts", async () => {
        const draft = await packs.createPackDraft(owner, {
            name: "Intro draft",
            credits: 3,
            validityDays: 30,
            price: "900",
            currency: "INR",
            serviceIds: [hiit],
        });
        const plain = await packs.listPacks(owner, {});
        expect(plain.some((p) => p.id === draft.id)).toBe(false);
        const withDrafts = await packs.listPacks(owner, { include: "drafts" });
        expect(withDrafts.find((p) => p.id === draft.id)).toMatchObject({
            status: "DRAFT",
            sold: 0,
            takings: [],
        });
    });
});
