/**
 * The Plan Editor's drafts (round-2 D5, the writers), against a real
 * Postgres: a new plan starts as a DRAFT; a live plan's edits wait in a
 * pending set that buyers never see until it is published; every write
 * carries the editor's revision and a stale one is refused naming who saved
 * since. Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PLATFORM_OPERATOR_ROLE_KEY } from "../audit/audit.service";
import { InvoicesService } from "../invoices/invoices.service";
import { PLAN_NOT_PUBLISHED, PLANS_ON_SALE } from "./plan-on-sale";
import { planViews } from "./plans";
import { SubscriptionsService } from "./subscriptions.service";

const service = new SubscriptionsService(new InvoicesService());

let asha: OrganizationContext;
let priya: OrganizationContext;
let elsewhere: OrganizationContext;
let names = 0;

async function teammate(
    organizationId: string,
    name: string,
): Promise<OrganizationContext> {
    names += 1;
    const user = await prisma.user.create({
        data: { email: `d5-${names}-${process.pid}@example.com`, name },
    });
    return { organizationId, userId: user.id, role: "OWNER" };
}

let people = 0;
async function person(ctx = asha): Promise<string> {
    people += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: ctx.organizationId,
                email: `d5-member-${people}@example.com`,
            },
        })
    ).id;
}

let plans = 0;
/** A live plan made the old way, as every plan before D5 was. */
async function livePlan(price = "1200"): Promise<string> {
    plans += 1;
    return (
        await service.createPlan(asha, {
            name: `Live ${plans}`,
            price,
            currency: "INR",
            interval: "MONTH",
            classesPerMonth: 8,
        })
    ).id;
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
    prisma.subscriptionPlan.findUniqueOrThrow({ where: { id } });

const events = (planId: string) =>
    prisma.subscriptionPlanEvent.findMany({
        where: { planId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Drafts", slug: `d5-drafts-${process.pid}` },
    });
    asha = await teammate(org.id, "Asha");
    priya = await teammate(org.id, "Priya");
    const other = await prisma.organization.create({
        data: { name: "Other", slug: `d5-other-${process.pid}` },
    });
    elsewhere = await teammate(other.id, "Olu");
});

describe("a new plan is a draft until it is published (D5)", () => {
    it("the first save makes a DRAFT nobody can buy, recorded as created", async () => {
        const draft = await service.createPlanDraft(asha, {
            name: "Unlimited",
        });
        expect(draft).toMatchObject({
            status: "DRAFT",
            revision: 0,
            hasPendingChanges: false,
            published: null,
            canDelete: true,
            values: {
                name: "Unlimited",
                price: null,
                currency: "INR",
                interval: "MONTH",
                classesPerMonth: null,
                description: null,
            },
            problems: [{ field: "price", message: "Set a price" }],
        });
        expect(draft.pendingChangedAt).not.toBeNull();

        const [created] = await events(draft.id);
        expect(created.kind).toBe("CREATED");
        expect(created.changes).toMatchObject({
            name: [null, "Unlimited"],
            status: [null, "DRAFT"],
        });

        await expect(
            service.subscribe(asha, {
                contactId: await person(),
                planId: draft.id,
            }),
        ).rejects.toThrow(PLAN_NOT_PUBLISHED);
    });

    it("a first save with no name is refused beside the field", async () => {
        await expect(
            service.createPlanDraft(asha, { price: "900" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("autosaves write the draft itself, bump the revision and record nothing", async () => {
        const draft = await service.createPlanDraft(asha, { name: "Weekly" });
        const saved = await service.savePlanDraft(asha, draft.id, {
            price: "350",
            interval: "WEEK",
            revision: draft.revision,
        });
        expect(saved.revision).toBe(draft.revision + 1);
        expect(saved.values).toMatchObject({
            price: "350.00",
            interval: "WEEK",
        });
        expect(saved.problems).toEqual([]);
        expect((await row(draft.id)).status).toBe("DRAFT");
        expect((await events(draft.id)).map((e) => e.kind)).toEqual([
            "CREATED",
        ]);

        // The same values again change nothing, and keep the revision.
        const again = await service.savePlanDraft(asha, draft.id, {
            price: "350.00",
            revision: saved.revision,
        });
        expect(again.revision).toBe(saved.revision);
    });

    it("publish without a price is refused on the price, and nothing goes live", async () => {
        const draft = await service.createPlanDraft(asha, { name: "Drop-in" });
        const body = await refusal(
            service.publishPlan(asha, draft.id, draft.revision),
        );
        expect(body.details).toEqual({ field: "price" });
        expect((await row(draft.id)).status).toBe("DRAFT");
    });

    it("publishing puts it on sale, records it once, and it sells", async () => {
        const draft = await service.createPlanDraft(asha, {
            name: "Ten classes",
            price: "2500",
            classesPerMonth: 10,
        });
        const live = await service.publishPlan(asha, draft.id, draft.revision);
        expect(live).toMatchObject({
            status: "ACTIVE",
            hasPendingChanges: false,
            revision: draft.revision + 1,
            canDelete: false,
            pendingChangedAt: null,
        });
        expect(live.published).toEqual(live.values);

        const kinds = (await events(draft.id)).map((e) => e.kind);
        expect(kinds).toEqual(["CREATED", "PUBLISHED"]);
        const published = (await events(draft.id))[1];
        expect(published.changes).toMatchObject({
            price: [null, "2500.00"],
            classesPerMonth: [null, 10],
            status: ["DRAFT", "ACTIVE"],
        });

        const sub = await service.subscribe(asha, {
            contactId: await person(),
            planId: draft.id,
        });
        expect(sub.price).toBe("2500.00");
    });

    it("a draft can be deleted, its history with it", async () => {
        const draft = await service.createPlanDraft(asha, { name: "Scrap" });
        await service.deletePlanDraft(asha, draft.id, draft.revision);
        expect(
            await prisma.subscriptionPlan.findUnique({
                where: { id: draft.id },
            }),
        ).toBeNull();
        expect(await events(draft.id)).toEqual([]);
    });

    it("deleting at a stale revision is refused and keeps the draft", async () => {
        const draft = await service.createPlanDraft(asha, { name: "Keep me" });
        await service.savePlanDraft(priya, draft.id, {
            price: "100",
            revision: draft.revision,
        });
        await refusal(service.deletePlanDraft(asha, draft.id, draft.revision));
        expect((await row(draft.id)).status).toBe("DRAFT");
    });

    it("a published plan can't be deleted; it is archived instead", async () => {
        const id = await livePlan();
        const editor = await service.getPlanEditor(asha, id);
        const body = await refusal(
            service.deletePlanDraft(asha, id, editor.revision),
        );
        expect(body.details).toEqual({ field: "status" });
    });

    it("a draft someone is on can't be deleted", async () => {
        // Nothing sells a draft; a plan sold, then marked DRAFT, stands in.
        const id = await livePlan();
        await service.subscribe(asha, {
            contactId: await person(),
            planId: id,
        });
        await prisma.subscriptionPlan.update({
            where: { id },
            data: { status: "DRAFT" },
        });
        const editor = await service.getPlanEditor(asha, id);
        expect(editor.canDelete).toBe(false);
        await refusal(service.deletePlanDraft(asha, id, editor.revision));
        expect(await prisma.subscriptionPlan.count({ where: { id } })).toBe(1);
    });

    it("a draft has nothing to discard", async () => {
        const draft = await service.createPlanDraft(asha, {
            name: "No discard",
        });
        await refusal(
            service.discardPlanChanges(asha, draft.id, draft.revision),
        );
    });

    it("the old whole-plan save refuses a draft", async () => {
        const draft = await service.createPlanDraft(asha, { name: "Old form" });
        await expect(
            service.updatePlan(asha, draft.id, { price: "100" }),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe("a live plan's changes wait until published (D5)", () => {
    it("buyers keep the published price until someone publishes", async () => {
        const id = await livePlan("1200");
        const open = await service.getPlanEditor(asha, id);
        expect(open).toMatchObject({
            status: "ACTIVE",
            hasPendingChanges: false,
            revision: 0,
            pendingChangedAt: null,
        });

        const saved = await service.savePlanDraft(asha, id, {
            price: "1500",
            revision: open.revision,
        });
        expect(saved).toMatchObject({
            hasPendingChanges: true,
            revision: 1,
            values: { price: "1500.00" },
            published: { price: "1200.00" },
        });

        // Subscribe charges the published ₹1,200; the site's list shows it.
        const before = await service.subscribe(asha, {
            contactId: await person(),
            planId: id,
        });
        expect(before.price).toBe("1200.00");
        const onSale = await planViews(asha.organizationId, {
            ...PLANS_ON_SALE,
            id,
        });
        expect(onSale[0].price).toBe("1200.00");
        // The Plans tab says it has unpublished changes.
        expect(onSale[0].pendingChangedAt).not.toBeNull();

        const live = await service.publishPlan(asha, id, saved.revision);
        expect(live).toMatchObject({
            hasPendingChanges: false,
            revision: 2,
            values: { price: "1500.00" },
            published: { price: "1500.00" },
        });
        const last = (await events(id)).at(-1);
        expect(last?.kind).toBe("PRICE_CHANGED");
        expect(last?.changes).toEqual({ price: ["1200.00", "1500.00"] });

        const after = await service.subscribe(asha, {
            contactId: await person(),
            planId: id,
        });
        expect(after.price).toBe("1500.00");
        // Whoever joined before keeps what they bought (ADR-007).
        expect((await service.get(asha, before.id)).price).toBe("1200.00");
    });

    it("putting every change back leaves no pending set", async () => {
        const id = await livePlan("1200");
        const a = await service.savePlanDraft(asha, id, {
            price: "1500",
            revision: 0,
        });
        const b = await service.savePlanDraft(asha, id, {
            price: "1200",
            revision: a.revision,
        });
        expect(b.hasPendingChanges).toBe(false);
        expect(b.pendingChangedAt).toBeNull();
        expect((await row(id)).pendingChanges).toBeNull();
    });

    it("discarding drops the changes, records it, and keeps what is live", async () => {
        const id = await livePlan("1200");
        const saved = await service.savePlanDraft(asha, id, {
            classesPerMonth: 12,
            revision: 0,
        });
        const back = await service.discardPlanChanges(asha, id, saved.revision);
        expect(back).toMatchObject({
            hasPendingChanges: false,
            values: { classesPerMonth: 8 },
        });
        const last = (await events(id)).at(-1);
        expect(last?.kind).toBe("DRAFT_DISCARDED");
        expect(last?.changes).toEqual({ classesPerMonth: [12, 8] });
    });

    it("a pending name another plan has is saved, and stops Publish on the name", async () => {
        const taken = await livePlan();
        const takenName = (await row(taken)).name;
        const id = await livePlan();
        const saved = await service.savePlanDraft(asha, id, {
            name: takenName.toUpperCase(),
            revision: 0,
        });
        expect(saved.values.name).toBe(takenName.toUpperCase());
        expect(saved.problems).toEqual([
            {
                field: "name",
                message: `There is already a plan called ${takenName}. Give this one another name.`,
            },
        ]);
        const body = await refusal(
            service.publishPlan(asha, id, saved.revision),
        );
        expect(body.details).toEqual({ field: "name" });
        expect((await row(id)).name).not.toBe(takenName.toUpperCase());
    });

    it("an archived plan isn't edited until it is sold again", async () => {
        const id = await livePlan();
        await service.setPlanStatus(asha, id, "ARCHIVED");
        const editor = await service.getPlanEditor(asha, id);
        const body = await refusal(
            service.savePlanDraft(asha, id, {
                price: "1",
                revision: editor.revision,
            }),
        );
        expect(body.details).toEqual({ field: "status" });
    });
});

describe("two editors on one plan (D5, #285)", () => {
    it("a save at an older revision is refused naming who saved, and writes nothing", async () => {
        const id = await livePlan("1200");
        const r = (await service.getPlanEditor(asha, id)).revision;

        // Both open it at revision r. Priya saves a price first.
        await service.savePlanDraft(priya, id, { price: "1500", revision: r });
        const body = await refusal(
            service.savePlanDraft(asha, id, {
                description: "Mornings only",
                revision: r,
            }),
        );
        expect(body.message).toBe(
            "Priya changed this plan while you were editing. Reload to see it.",
        );
        expect(body.details).toMatchObject({
            yours: r,
            current: r + 1,
            changedBy: "Priya",
        });
        expect(typeof body.details.changedAt).toBe("string");

        const now = await service.getPlanEditor(asha, id);
        expect(now.values).toMatchObject({
            price: "1500.00",
            description: null,
        });
    });

    it("publishing at an older revision is refused; nothing is published", async () => {
        const id = await livePlan("1200");
        const r = (await service.getPlanEditor(asha, id)).revision;
        const mine = await service.savePlanDraft(asha, id, {
            price: "1300",
            revision: r,
        });
        await service.savePlanDraft(priya, id, {
            price: "1500",
            revision: mine.revision,
        });
        await refusal(service.publishPlan(asha, id, mine.revision));
        expect((await row(id)).price.toString()).toBe("1200");
    });

    it("a change through the old form moves the revision, naming who made it", async () => {
        const id = await livePlan("1200");
        const r = (await service.getPlanEditor(asha, id)).revision;
        await service.updatePlan(priya, id, { classesPerMonth: 4 });
        const body = await refusal(
            service.savePlanDraft(asha, id, { price: "1300", revision: r }),
        );
        expect(body.details).toMatchObject({
            current: r + 1,
            changedBy: "Priya",
        });
    });

    it("a Saroh operator's save is named Saroh support, never by name", async () => {
        const id = await livePlan("1200");
        const operator: OrganizationContext = {
            ...priya,
            roleKey: PLATFORM_OPERATOR_ROLE_KEY,
        };
        await service.savePlanDraft(operator, id, {
            price: "1500",
            revision: 0,
        });
        expect((await row(id)).pendingChangedById).toBeNull();
        const body = await refusal(
            service.savePlanDraft(asha, id, { price: "1300", revision: 0 }),
        );
        expect(body.details.changedBy).toBe("Saroh support");
    });

    it("publish and a subscribe at once don't deadlock; the member gets one whole price", async () => {
        const id = await livePlan("1200");
        const saved = await service.savePlanDraft(asha, id, {
            price: "1500",
            revision: 0,
        });
        const contactId = await person();
        const [, sub] = await Promise.all([
            service.publishPlan(asha, id, saved.revision),
            service.subscribe(asha, { contactId, planId: id }),
        ]);
        expect(["1200.00", "1500.00"]).toContain(sub.price);
        expect((await row(id)).price.toString()).toBe("1500");
    });
});

describe("the staff Plans list and other businesses (D5)", () => {
    it("lists drafts only when asked, so an older app never shows one", async () => {
        const draft = await service.createPlanDraft(asha, { name: "Hidden" });
        const live = await livePlan();

        const plain = (await service.listPlans(asha, {})).map((p) => p.id);
        expect(plain).toContain(live);
        expect(plain).not.toContain(draft.id);

        const all = (await service.listPlans(asha, { include: "drafts" })).map(
            (p) => p.id,
        );
        expect(all).toEqual(expect.arrayContaining([live, draft.id]));

        const drafts = await service.listPlans(asha, { status: "DRAFT" });
        expect(drafts.every((p) => p.status === "DRAFT")).toBe(true);
        expect(drafts.map((p) => p.id)).toContain(draft.id);
    });

    it("another business's plan is a 404 to every draft route", async () => {
        const id = await livePlan();
        await expect(
            service.getPlanEditor(elsewhere, id),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.savePlanDraft(elsewhere, id, { price: "1", revision: 0 }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.publishPlan(elsewhere, id, 0),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.discardPlanChanges(elsewhere, id, 0),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.deletePlanDraft(elsewhere, id, 0),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("the editor knows what switchers' autopay covers (D13)", () => {
    let mandates = 0;
    /** A member on `from`, booked to switch to `to`, with autopay up to `cap`. */
    async function switcher(
        from: string,
        to: string,
        cap: number,
        status = "ACTIVE",
    ): Promise<string> {
        const contactId = await person();
        const sub = await service.subscribe(asha, { contactId, planId: from });
        await service.changePlan(asha, sub.id, { planId: to });
        mandates += 1;
        await prisma.paymentMandate.create({
            data: {
                organizationId: asha.organizationId,
                contactId,
                subscriptionId: sub.id,
                provider: "RAZORPAY",
                providerMandateId: `token_d13w_${mandates}_${process.pid}`,
                status,
                method: "UPI",
                maxAmountCents: cap,
            },
        });
        return sub.id;
    }

    it("groups the limits of members booked to switch, lowest first", async () => {
        const from = await livePlan("1000");
        const to = await livePlan("1200");
        await switcher(from, to, 150_000);
        await switcher(from, to, 150_000);
        await switcher(from, to, 130_000);
        const editor = await service.getPlanEditor(asha, to);
        expect(editor.autopayLimits).toEqual([
            { limit: "1300.00", members: 1 },
            { limit: "1500.00", members: 2 },
        ]);
        // Every draft route answers with the same view.
        const saved = await service.savePlanDraft(asha, to, {
            price: "1800",
            revision: editor.revision,
        });
        expect(saved.autopayLimits).toEqual(editor.autopayLimits);
    });

    it("leaves out members already on the plan: they keep their price", async () => {
        const id = await livePlan("1200");
        const other = await livePlan("900");
        // On the plan with autopay, and booked to switch away from it.
        await switcher(id, other, 150_000);
        expect((await service.getPlanEditor(asha, id)).autopayLimits).toEqual(
            [],
        );
    });

    it("leaves out autopay that no longer charges, and an ended subscription", async () => {
        const from = await livePlan("1000");
        const to = await livePlan("1200");
        await switcher(from, to, 150_000, "CANCELLED");
        const ended = await switcher(from, to, 150_000);
        await prisma.customerSubscription.update({
            where: { id: ended },
            data: { status: "CANCELLED" },
        });
        expect((await service.getPlanEditor(asha, to)).autopayLimits).toEqual(
            [],
        );
    });

    it("a draft has none: nobody can switch to it", async () => {
        const draft = await service.createPlanDraft(asha, { name: "Fresh" });
        expect(draft.autopayLimits).toEqual([]);
    });
});
