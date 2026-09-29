/**
 * The Pack Editor's drafts (round-2 E14, on D5's shared draft rules),
 * against a real Postgres: a new pack starts as a DRAFT nobody can buy; a
 * live pack's edits wait in a pending set that sales never read until it is
 * published; every write carries the editor's revision and a stale one is
 * refused naming who saved since. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PLATFORM_OPERATOR_ROLE_KEY } from "../audit/audit.service";
import { InvoicesService } from "../invoices/invoices.service";
import { ClassPacksService } from "./class-packs.service";
import { PACK_NOT_PUBLISHED } from "./pack-on-sale";

const packs = new ClassPacksService(new InvoicesService());

let asha: OrganizationContext;
let priya: OrganizationContext;
let elsewhere: OrganizationContext;
let vinyasa: string;
let hiit: string;
let names = 0;

async function teammate(
    organizationId: string,
    name: string,
): Promise<OrganizationContext> {
    names += 1;
    const user = await prisma.user.create({
        data: { email: `e14-${names}-${process.pid}@example.com`, name },
    });
    return { organizationId, userId: user.id, role: "OWNER" };
}

let people = 0;
async function person(): Promise<string> {
    people += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: asha.organizationId,
                email: `e14-holder-${people}@example.com`,
                firstName: "Holder",
            },
        })
    ).id;
}

async function service(name: string): Promise<string> {
    return (
        await prisma.service.create({
            data: {
                organizationId: asha.organizationId,
                name,
                durationMinutes: 60,
                capacity: 20,
                timezone: "UTC",
                status: "ACTIVE",
            },
        })
    ).id;
}

let made = 0;
/** A live pack made the old way, as every pack before E14 was. */
async function livePack(price = "4500") {
    made += 1;
    return packs.createPack(asha, {
        name: `Live ${made}`,
        credits: 10,
        validityDays: 90,
        price,
        currency: "INR",
        serviceIds: [vinyasa],
    });
}

/** A finished draft, ready to publish. */
async function readyDraft(name = "Ten classes") {
    return packs.createPackDraft(asha, {
        name,
        credits: 10,
        validityDays: 90,
        price: "4500",
        currency: "INR",
        serviceIds: [vinyasa],
    });
}

/** The 409 a call answers with: its message and details. */
async function refusal(
    call: Promise<unknown>,
): Promise<{ message: string; details: Record<string, unknown> }> {
    try {
        await call;
    } catch (e) {
        expect(e).toBeInstanceOf(ConflictException);
        return (e as ConflictException).getResponse() as {
            message: string;
            details: Record<string, unknown>;
        };
    }
    throw new Error("expected a 409");
}

const row = (id: string) =>
    prisma.classPack.findUniqueOrThrow({
        where: { id },
        include: { services: true },
    });

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Pack drafts", slug: `e14-drafts-${process.pid}` },
    });
    await giveBusinessDetails(org.id);
    asha = await teammate(org.id, "Asha");
    priya = await teammate(org.id, "Priya");
    const other = await prisma.organization.create({
        data: { name: "Other", slug: `e14-other-${process.pid}` },
    });
    await giveBusinessDetails(other.id);
    elsewhere = await teammate(other.id, "Olu");
    vinyasa = await service("Vinyasa");
    hiit = await service("HIIT");
});

describe("a new pack is a draft until it is published (E14)", () => {
    it("the first save makes a DRAFT nobody can buy; Publish puts it on sale", async () => {
        const draft = await packs.createPackDraft(asha, { name: "Starter" });
        expect(draft).toMatchObject({
            status: "DRAFT",
            revision: 0,
            hasPendingChanges: false,
            published: null,
            canDelete: true,
            values: {
                name: "Starter",
                description: null,
                credits: null,
                validityDays: null,
                price: null,
                currency: "INR",
                serviceIds: [],
            },
        });
        expect(draft.problems.map((p) => p.field)).toEqual([
            "credits",
            "validityDays",
            "price",
            "serviceIds",
        ]);
        expect(draft.pendingChangedAt).not.toBeNull();

        // Not sellable, and not on the list an older app reads.
        const buyer = await person();
        const refused = await refusal(
            packs.sell(asha, draft.id, { contactId: buyer }),
        );
        expect(refused).toEqual({
            message: PACK_NOT_PUBLISHED,
            details: { field: "packId" },
        });
        const listed = (await packs.listPacks(asha, {})).map((p) => p.id);
        expect(listed).not.toContain(draft.id);
        const withDrafts = await packs.listPacks(asha, { include: "drafts" });
        expect(withDrafts.find((p) => p.id === draft.id)).toMatchObject({
            status: "DRAFT",
            hasPendingChanges: false,
        });
        expect(
            (await packs.listPacks(asha, { status: "DRAFT" })).map((p) => p.id),
        ).toContain(draft.id);

        // Publishing while something is missing publishes nothing.
        const early = await refusal(
            packs.publishPack(asha, draft.id, draft.revision),
        );
        expect(early.details).toEqual({ field: "credits" });
        expect((await row(draft.id)).status).toBe("DRAFT");

        const filled = await packs.savePackDraft(asha, draft.id, {
            revision: draft.revision,
            credits: 5,
            validityDays: 60,
            price: "2500",
            serviceIds: [hiit, vinyasa, hiit],
        });
        expect(filled.revision).toBe(1);
        expect(filled.values).toMatchObject({
            credits: 5,
            validityDays: 60,
            price: "2500.00",
            serviceIds: [hiit, vinyasa].sort(),
        });
        expect(filled.problems).toEqual([]);

        const live = await packs.publishPack(asha, draft.id, filled.revision);
        expect(live).toMatchObject({
            status: "ACTIVE",
            revision: 2,
            hasPendingChanges: false,
            canDelete: false,
            pendingChangedAt: null,
        });
        expect(live.published).toEqual(live.values);

        const sold = await packs.sell(asha, draft.id, { contactId: buyer });
        expect(sold).toMatchObject({ credits: 5, price: "2500.00" });
        expect((await packs.listPacks(asha, {})).map((p) => p.id)).toContain(
            draft.id,
        );
    });

    it("keeps a draft's services on the draft itself", async () => {
        const draft = await packs.createPackDraft(asha, {
            name: "Mixed",
            serviceIds: [vinyasa],
        });
        const saved = await packs.savePackDraft(asha, draft.id, {
            revision: 0,
            serviceIds: [hiit],
        });
        expect(saved.values.serviceIds).toEqual([hiit]);
        expect((await row(draft.id)).services.map((s) => s.serviceId)).toEqual([
            hiit,
        ]);
    });

    it("refuses a service of another business, and writes nothing", async () => {
        const draft = await readyDraft("Guarded");
        const theirs = await prisma.service.create({
            data: {
                organizationId: elsewhere.organizationId,
                name: "Theirs",
                durationMinutes: 60,
                timezone: "UTC",
            },
        });
        await expect(
            packs.savePackDraft(asha, draft.id, {
                revision: draft.revision,
                serviceIds: [theirs.id],
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect((await row(draft.id)).draftRevision).toBe(draft.revision);
    });

    it("can't be emptied of its name", async () => {
        const draft = await readyDraft("Named");
        await expect(
            packs.savePackDraft(asha, draft.id, {
                revision: draft.revision,
                name: null as unknown as string,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("Delete draft removes a pack never published, and nothing else", async () => {
        const draft = await readyDraft("Gone soon");
        await packs.deletePackDraft(asha, draft.id, draft.revision);
        expect(
            await prisma.classPack.findUnique({ where: { id: draft.id } }),
        ).toBeNull();
        expect(
            await prisma.classPackService.count({
                where: { packId: draft.id },
            }),
        ).toBe(0);

        const live = await livePack();
        const view = await packs.getPackEditor(asha, live.id);
        const kept = await refusal(
            packs.deletePackDraft(asha, live.id, view.revision),
        );
        expect(kept.message).toMatch(/Only a draft can be deleted/);
        expect(await prisma.classPack.count({ where: { id: live.id } })).toBe(
            1,
        );
    });

    it("the old form's writes never touch a draft", async () => {
        const draft = await readyDraft("Old form");
        await expect(
            packs.updatePack(asha, draft.id, { price: "1" }),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            packs.setPackStatus(asha, draft.id, "ACTIVE"),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            packs.setPackStatus(asha, draft.id, "ARCHIVED"),
        ).rejects.toBeInstanceOf(ConflictException);
        const after = await row(draft.id);
        expect(after.status).toBe("DRAFT");
        expect(after.price.toString()).toBe("4500");
    });
});

describe("a live pack's unpublished changes (E14)", () => {
    it("sales keep the published price until Publish changes; purchases keep theirs after", async () => {
        const pack = await livePack("4500");
        const open = await packs.getPackEditor(asha, pack.id);
        expect(open).toMatchObject({
            status: "ACTIVE",
            revision: 0,
            hasPendingChanges: false,
            canDelete: false,
        });

        const pending = await packs.savePackDraft(asha, pack.id, {
            revision: open.revision,
            price: "5000",
            serviceIds: [vinyasa, hiit],
        });
        expect(pending).toMatchObject({
            hasPendingChanges: true,
            revision: 1,
            values: { price: "5000.00" },
            published: { price: "4500.00", serviceIds: [vinyasa] },
        });
        expect(pending.pendingChangedAt).not.toBeNull();

        // Sales, the list and the pack read the published terms.
        const before = await packs.sell(asha, pack.id, {
            contactId: await person(),
        });
        expect(before.price).toBe("4500.00");
        expect(await packs.getPack(asha, pack.id)).toMatchObject({
            price: "4500.00",
            services: [{ id: vinyasa, name: "Vinyasa" }],
            hasPendingChanges: true,
        });
        const stored = await row(pack.id);
        expect(stored.price.toString()).toBe("4500");
        expect(stored.services.map((s) => s.serviceId)).toEqual([vinyasa]);

        const published = await packs.publishPack(
            asha,
            pack.id,
            pending.revision,
        );
        expect(published).toMatchObject({
            hasPendingChanges: false,
            revision: 2,
            values: { price: "5000.00" },
            published: { price: "5000.00" },
        });
        expect(published.values.serviceIds).toEqual([vinyasa, hiit].sort());

        const after = await packs.sell(asha, pack.id, {
            contactId: await person(),
        });
        expect(after.price).toBe("5000.00");
        expect((await packs.getPurchase(asha, before.id)).price).toBe(
            "4500.00",
        );
    });

    it("drops a change put back as it is live, and holds none when all are", async () => {
        const pack = await livePack("4500");
        const changed = await packs.savePackDraft(asha, pack.id, {
            revision: 0,
            price: "5000",
            credits: 12,
        });
        expect(changed.hasPendingChanges).toBe(true);
        const partly = await packs.savePackDraft(asha, pack.id, {
            revision: changed.revision,
            price: "4500",
        });
        expect(partly.hasPendingChanges).toBe(true);
        expect((await row(pack.id)).pendingChanges).toEqual({ credits: 12 });
        const back = await packs.savePackDraft(asha, pack.id, {
            revision: partly.revision,
            credits: 10,
        });
        expect(back).toMatchObject({
            hasPendingChanges: false,
            pendingChangedAt: null,
        });
        expect((await row(pack.id)).pendingChanges).toBeNull();

        // A save that changes nothing writes nothing, not even the revision.
        const same = await packs.savePackDraft(asha, pack.id, {
            revision: back.revision,
            name: pack.name,
        });
        expect(same.revision).toBe(back.revision);
    });

    it("Discard restores the published view", async () => {
        const pack = await livePack("4500");
        const pending = await packs.savePackDraft(asha, pack.id, {
            revision: 0,
            price: "9999",
            name: "Renamed",
        });
        const discarded = await packs.discardPackChanges(
            asha,
            pack.id,
            pending.revision,
        );
        expect(discarded).toMatchObject({
            hasPendingChanges: false,
            values: { price: "4500.00", name: pack.name },
        });
        expect(discarded.values).toEqual(discarded.published);

        const draft = await readyDraft("No going back");
        const nothing = await refusal(
            packs.discardPackChanges(asha, draft.id, draft.revision),
        );
        expect(nothing.message).toMatch(/Delete the draft instead/);
    });

    it("an archived pack takes no changes until it is sold again", async () => {
        const pack = await livePack();
        await packs.setPackStatus(asha, pack.id, "ARCHIVED");
        const view = await packs.getPackEditor(asha, pack.id);
        const refused = await refusal(
            packs.savePackDraft(asha, pack.id, {
                revision: view.revision,
                price: "1",
            }),
        );
        expect(refused.message).toMatch(/archived/);
    });

    it("Publish refuses a change that breaks the pack, and publishes nothing", async () => {
        const pack = await livePack();
        const pending = await packs.savePackDraft(asha, pack.id, {
            revision: 0,
            serviceIds: [],
        });
        expect(pending.problems).toEqual([
            {
                field: "serviceIds",
                message: "Choose the classes it pays for",
            },
        ]);
        const refused = await refusal(
            packs.publishPack(asha, pack.id, pending.revision),
        );
        expect(refused.details).toEqual({ field: "serviceIds" });
        expect((await row(pack.id)).services.map((s) => s.serviceId)).toEqual([
            vinyasa,
        ]);
    });
});

describe("two editors on one pack (E14, #285)", () => {
    it("the second autosave on a stale revision gets 409 naming who saved, and nothing is overwritten", async () => {
        const pack = await livePack("4500");
        const tabA = await packs.getPackEditor(asha, pack.id);
        const tabB = await packs.getPackEditor(priya, pack.id);

        const saved = await packs.savePackDraft(priya, pack.id, {
            revision: tabB.revision,
            price: "4800",
        });

        const stale = await refusal(
            packs.savePackDraft(asha, pack.id, {
                revision: tabA.revision,
                price: "5200",
            }),
        );
        expect(stale.message).toBe(
            "Priya changed this pack while you were editing. Reload to see it.",
        );
        expect(stale.details).toEqual({
            yours: tabA.revision,
            current: saved.revision,
            changedBy: "Priya",
            changedAt: expect.any(String) as unknown as string,
        });
        const kept = await packs.getPackEditor(asha, pack.id);
        expect(kept.values.price).toBe("4800.00");
        expect(kept.revision).toBe(saved.revision);
    });

    it("Publish is refused when the pending set changed since the publisher loaded it", async () => {
        const pack = await livePack("4500");
        const loaded = await packs.savePackDraft(asha, pack.id, {
            revision: 0,
            price: "5000",
        });
        await packs.savePackDraft(priya, pack.id, {
            revision: loaded.revision,
            price: "9000",
        });
        await refusal(packs.publishPack(asha, pack.id, loaded.revision));
        expect((await row(pack.id)).price.toString()).toBe("4500");
    });

    it("a change through the old form moves the revision too", async () => {
        const pack = await livePack("4500");
        const open = await packs.getPackEditor(asha, pack.id);
        await packs.updatePack(priya, pack.id, { price: "4700" });
        const stale = await refusal(
            packs.savePackDraft(asha, pack.id, {
                revision: open.revision,
                price: "5000",
            }),
        );
        expect(stale.details.changedBy).toBe("Priya");

        const reopened = await packs.getPackEditor(asha, pack.id);
        await packs.setPackStatus(priya, pack.id, "ARCHIVED");
        const archived = await refusal(
            packs.discardPackChanges(asha, pack.id, reopened.revision),
        );
        expect(archived.details).toMatchObject({
            yours: reopened.revision,
            current: reopened.revision + 1,
            changedBy: "Priya",
        });
    });

    it("names a Saroh operator as Saroh support, never by name", async () => {
        const pack = await livePack();
        const open = await packs.getPackEditor(asha, pack.id);
        const operator = await teammate(asha.organizationId, "Ops Person");
        await packs.savePackDraft(
            { ...operator, roleKey: PLATFORM_OPERATOR_ROLE_KEY },
            pack.id,
            { revision: open.revision, price: "1" },
        );
        const stale = await refusal(
            packs.savePackDraft(asha, pack.id, {
                revision: open.revision,
                price: "2",
            }),
        );
        expect(stale.details.changedBy).toBe("Saroh support");
        expect((await row(pack.id)).revisedById).toBeNull();
    });
});

describe("another business's pack (E14)", () => {
    it("is a 404 to every editor call", async () => {
        const pack = await livePack();
        const calls = [
            packs.getPackEditor(elsewhere, pack.id),
            packs.savePackDraft(elsewhere, pack.id, {
                revision: 0,
                price: "1",
            }),
            packs.publishPack(elsewhere, pack.id, 0),
            packs.discardPackChanges(elsewhere, pack.id, 0),
            packs.deletePackDraft(elsewhere, pack.id, 0),
        ];
        for (const call of calls) {
            await expect(call).rejects.toBeInstanceOf(NotFoundException);
        }
        expect((await row(pack.id)).draftRevision).toBe(0);
    });
});
