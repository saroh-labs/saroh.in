/**
 * Bulk kitchen moves against a real Postgres (round-2 B6): a batch held on
 * the server and committed by its job or "Send now", each line through the
 * single order's stage write; Undo all while held and after; a retry of the
 * same batch id; a stale selection; another business's orders; walk-ins;
 * stock only on the handover; and A14's notices queued once per order and
 * taken back by the undo, or "already told".
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { ForbiddenException } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";
import { randomUUID } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
import type { OrderStage } from "./dto";
import { OrderKitchenService } from "./order-kitchen.service";
import { OrderStageBatchCommitHandler } from "./order-stage-batch.handler";
import {
    ORDER_STAGE_BATCH_COMMIT_TYPE,
    OrderStageBatchService,
    STAGE_BATCH_HOLD_MS,
} from "./order-stage-batch.service";

const kitchen = new OrderKitchenService();
const batches = new OrderStageBatchService();
const handler = new OrderStageBatchCommitHandler(batches);

let owner: OrganizationContext;
let member: OrganizationContext;
let reviewer: OrganizationContext;
let other: OrganizationContext;
let storeId: string;
let otherStoreId: string;
let customerId: string;
let pastry: string;
let shelf: string;
let seq = 0;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `batch-org-${process.pid}` },
    });
    owner = { organizationId: org.id, userId: "user_owner", role: "OWNER" };
    member = { organizationId: org.id, userId: "user_member", role: "MEMBER" };
    reviewer = {
        organizationId: org.id,
        userId: "user_reviewer",
        role: "REVIEWER",
    };
    storeId = (
        await prisma.store.create({
            data: {
                name: "Rye & Co.",
                slug: `batch-store-${process.pid}`,
                organizationId: org.id,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: org.id,
                email: "asha@example.in",
                firstName: "Asha",
            },
        })
    ).id;
    const p = await prisma.product.create({
        data: {
            storeId,
            organizationId: org.id,
            name: "Croissant",
            slug: `croissant-${process.pid}`,
            price: "120.00",
            stockTracked: true,
        },
    });
    pastry = p.id;
    shelf = (
        await prisma.stockLevel.create({
            data: {
                storeId,
                organizationId: org.id,
                productId: p.id,
                onHand: 500,
            },
        })
    ).id;

    const otherOrg = await prisma.organization.create({
        data: { name: "Elsewhere", slug: `batch-other-${process.pid}` },
    });
    other = { organizationId: otherOrg.id, userId: "user_x", role: "OWNER" };
    otherStoreId = (
        await prisma.store.create({
            data: {
                name: "Elsewhere",
                slug: `batch-other-store-${process.pid}`,
                organizationId: otherOrg.id,
            },
        })
    ).id;
});

/**
 * A paid pick-up order holding two croissants, at the given step. A
 * walk-in has no customer record (B13).
 */
async function order(
    stage: OrderStage,
    over: { paid?: boolean; walkIn?: boolean; ctx?: OrganizationContext } = {},
): Promise<string> {
    seq += 1;
    const ctx = over.ctx ?? owner;
    const inOwner = ctx === owner;
    const status =
        stage === "NEW"
            ? "PENDING"
            : stage === "COLLECTED"
              ? "DELIVERED"
              : "PROCESSING";
    const row = await prisma.order.create({
        data: {
            storeId: inOwner ? storeId : otherStoreId,
            organizationId: ctx.organizationId,
            customerId: over.walkIn || !inOwner ? null : customerId,
            walkInName: over.walkIn ? "Ravi" : null,
            orderId: `B6-${seq}`,
            currency: "INR",
            subtotal: "240.00",
            total: "240.00",
            paymentStatus: over.paid === false ? "UNPAID" : "PAID",
            stage,
            status,
            items: inOwner
                ? {
                      create: [
                          {
                              productId: pastry,
                              quantity: 2,
                              price: "120.00",
                              stockRow: "PRODUCT",
                              stockLevelId: shelf,
                              heldQuantity: 2,
                          },
                      ],
                  }
                : undefined,
        },
    });
    if (inOwner) {
        await prisma.stockLevel.update({
            where: { id: shelf },
            data: { promised: { increment: 2 } },
        });
    }
    return row.id;
}

async function stock() {
    return prisma.stockLevel.findUniqueOrThrow({
        where: { id: shelf },
        select: { onHand: true, promised: true },
    });
}

async function stages(ids: string[]) {
    const rows = await prisma.order.findMany({
        where: { id: { in: ids } },
        select: { id: true, stage: true },
    });
    return ids.map((id) => rows.find((r) => r.id === id)?.stage);
}

function lines(ids: string[], from: OrderStage, to: OrderStage) {
    return ids.map((orderId) => ({ orderId, from, to }));
}

async function commitJob(batchId: string): Promise<Job | null> {
    return prisma.job.findFirst({
        where: {
            type: ORDER_STAGE_BATCH_COMMIT_TYPE,
            payload: { path: ["batchId"], equals: batchId },
        },
    });
}

async function noticeJobs(eventIds: string[]) {
    return prisma.job.count({
        where: {
            type: CUSTOMER_NOTIFY_TYPE,
            status: "PENDING",
            OR: eventIds.map((id) => ({
                payload: { path: ["orderEventId"], equals: id },
            })),
        },
    });
}

describe("bulk kitchen moves (real database)", () => {
    it("holds 3 Preparing → Ready, then the job commits them: 3 steps, their ids on the lines", async () => {
        const ids = [
            await order("PREPARING"),
            await order("PREPARING"),
            await order("PREPARING"),
        ];
        const batchId = randomUUID();
        const before = Date.now();
        const held = await batches.create(member, {
            batchId,
            lines: lines(ids, "PREPARING", "READY"),
        });

        expect(held.status).toBe("HELD");
        expect(held.lines.map((l) => l.result)).toEqual([
            "PENDING",
            "PENDING",
            "PENDING",
        ]);
        // Nothing moved during the hold.
        expect(await stages(ids)).toEqual([
            "PREPARING",
            "PREPARING",
            "PREPARING",
        ]);
        const job = await commitJob(batchId);
        expect(job?.organizationId).toBe(owner.organizationId);
        expect(job!.runAt.getTime()).toBeGreaterThanOrEqual(
            before + STAGE_BATCH_HOLD_MS - 50,
        );

        // The tab closed; the job commits it.
        await handler.handle(job!);

        const done = await batches.get(member, batchId);
        expect(done.status).toBe("COMMITTED");
        expect(done.lines.map((l) => l.result)).toEqual([
            "MOVED",
            "MOVED",
            "MOVED",
        ]);
        expect(await stages(ids)).toEqual(["READY", "READY", "READY"]);
        const events = await prisma.orderEvent.findMany({
            where: { orderId: { in: ids }, kind: "STAGE" },
            select: { id: true, orderId: true, actorUserId: true },
        });
        expect(events).toHaveLength(3);
        expect(done.lines.map((l) => l.eventId).sort()).toEqual(
            events.map((e) => e.id).sort(),
        );
        // In the name of whoever asked.
        expect(events.every((e) => e.actorUserId === "user_member")).toBe(true);
        // A14: one Ready notice per order and event, held ten seconds.
        expect(await noticeJobs(events.map((e) => e.id))).toBe(3);
    });

    it("Send now commits at once; the job then finds nothing to do", async () => {
        const ids = [await order("PREPARING"), await order("PREPARING")];
        const batchId = randomUUID();
        await batches.create(owner, {
            batchId,
            lines: lines(ids, "PREPARING", "READY"),
        });
        const sent = await batches.commit(owner, batchId);
        expect(sent.lines.every((l) => l.result === "MOVED")).toBe(true);

        await handler.handle((await commitJob(batchId))!);
        expect(
            await prisma.orderEvent.count({
                where: { orderId: { in: ids }, kind: "STAGE" },
            }),
        ).toBe(2);
    });

    it("`now` commits a step that tells no one without a hold", async () => {
        const ids = [await order("NEW"), await order("NEW")];
        const done = await batches.create(owner, {
            batchId: randomUUID(),
            lines: lines(ids, "NEW", "PREPARING"),
            now: true,
        });
        expect(done.status).toBe("COMMITTED");
        expect(await stages(ids)).toEqual(["PREPARING", "PREPARING"]);
    });

    it("an order moved by someone else during the hold fails that line; the others move", async () => {
        const ids = [
            await order("PREPARING"),
            await order("PREPARING"),
            await order("PREPARING"),
        ];
        const batchId = randomUUID();
        await batches.create(owner, {
            batchId,
            lines: lines(ids, "PREPARING", "READY"),
        });
        await kitchen.moveStage(member, ids[1], { to: "READY" });

        const done = await batches.commit(owner, batchId);
        expect(done.lines.map((l) => [l.result, l.reason])).toEqual([
            ["MOVED", null],
            ["MOVED_BY_SOMEONE_ELSE", "moved by someone else"],
            ["MOVED", null],
        ]);
        // One step each: the other person's, and ours on the other two.
        expect(
            await prisma.orderEvent.count({
                where: { orderId: { in: ids }, kind: "STAGE" },
            }),
        ).toBe(3);
    });

    it("Undo all during the hold cancels it: no order touched, the job taken back", async () => {
        const ids = [await order("PREPARING"), await order("PREPARING")];
        const batchId = randomUUID();
        await batches.create(owner, {
            batchId,
            lines: lines(ids, "PREPARING", "READY"),
        });
        const undone = await batches.undo(owner, batchId);
        expect(undone.status).toBe("CANCELLED");
        expect(await commitJob(batchId)).toBeNull();

        // A commit arriving late (Send now, a stray job) moves nothing.
        const late = await batches.commitBatch(owner.organizationId, batchId);
        expect(late.status).toBe("CANCELLED");
        expect(await stages(ids)).toEqual(["PREPARING", "PREPARING"]);
        expect(
            await prisma.orderEvent.count({ where: { orderId: { in: ids } } }),
        ).toBe(0);
    });

    it("a retry of the same batch id returns the stored results and moves nothing again", async () => {
        const ids = [await order("PREPARING"), await order("PREPARING")];
        const batchId = randomUUID();
        const dto = { batchId, lines: lines(ids, "PREPARING", "READY") };
        await batches.create(owner, dto);
        const first = await batches.commit(owner, batchId);

        // The reply was lost; the client tries again.
        const again = await batches.create(owner, { ...dto, now: true });
        expect(again).toEqual(first);
        expect(again.lines.every((l) => l.result === "MOVED")).toBe(true);
        expect(await batches.commit(owner, batchId)).toEqual(first);
        expect(
            await prisma.orderEvent.count({
                where: { orderId: { in: ids }, kind: "STAGE" },
            }),
        ).toBe(2);

        // The same id with other orders is refused, not merged.
        await expect(
            batches.create(owner, {
                batchId,
                lines: lines([ids[0]], "PREPARING", "READY"),
            }),
        ).rejects.toThrow(/other orders/);
    });

    it("Undo all after commit undoes each line; one collected since is named", async () => {
        const ids = [
            await order("PREPARING"),
            await order("PREPARING"),
            await order("PREPARING"),
        ];
        const batchId = randomUUID();
        await batches.create(owner, {
            batchId,
            lines: lines(ids, "PREPARING", "READY"),
        });
        const done = await batches.commit(owner, batchId);
        const eventIds = done.lines.map((l) => l.eventId!);
        await kitchen.moveStage(member, ids[2], { to: "COLLECTED" });

        const undone = await batches.undo(owner, batchId);
        expect(undone.lines.map((l) => l.undo)).toEqual([
            { result: "UNDONE", reason: null, told: false },
            { result: "UNDONE", reason: null, told: false },
            { result: "REFUSED", reason: "already collected", told: false },
        ]);
        expect(await stages(ids)).toEqual([
            "PREPARING",
            "PREPARING",
            "COLLECTED",
        ]);
        // The undone lines' Ready notices are taken back unsent.
        expect(await noticeJobs(eventIds.slice(0, 2))).toBe(0);

        // Undo all again changes nothing.
        expect(await batches.undo(owner, batchId)).toEqual(undone);
    });

    it("says a customer was already told when their notice had gone", async () => {
        const id = await order("PREPARING");
        const batchId = randomUUID();
        await batches.create(owner, {
            batchId,
            lines: lines([id], "PREPARING", "READY"),
        });
        const done = await batches.commit(owner, batchId);
        const eventId = done.lines[0].eventId!;
        // The notice left: its job ran and wrote the ledger's email.
        await prisma.job.deleteMany({
            where: { payload: { path: ["orderEventId"], equals: eventId } },
        });
        await prisma.customerNotice.create({
            data: {
                organizationId: owner.organizationId,
                eventKey: `order:${eventId}`,
                kind: "ORDER_READY",
                orderId: id,
                messageId: "msg_1",
            },
        });

        const undone = await batches.undo(owner, batchId);
        expect(undone.lines[0].undo).toEqual({
            result: "UNDONE",
            reason: null,
            told: true,
        });
        expect(await stages([id])).toEqual(["PREPARING"]);
    });

    it("commits stock only on the handover step (DEC-032)", async () => {
        const ready = [await order("PREPARING"), await order("PREPARING")];
        const before = await stock();
        await batches.create(owner, {
            batchId: randomUUID(),
            lines: lines(ready, "PREPARING", "READY"),
            now: true,
        });
        expect(await stock()).toEqual(before);

        await batches.create(owner, {
            batchId: randomUUID(),
            lines: lines(ready, "READY", "COLLECTED"),
            now: true,
        });
        expect(await stock()).toEqual({
            onHand: before.onHand - 4,
            promised: before.promised - 4,
        });
    });

    it("moves a walk-in, who has no customer record, with the rest", async () => {
        const ids = [
            await order("PREPARING", { walkIn: true }),
            await order("PREPARING"),
        ];
        const done = await batches.create(owner, {
            batchId: randomUUID(),
            lines: lines(ids, "PREPARING", "READY"),
            now: true,
        });
        expect(done.lines.map((l) => l.result)).toEqual(["MOVED", "MOVED"]);
        expect(await stages(ids)).toEqual(["READY", "READY"]);
    });

    it("another business's orders are not found, line by line, and nothing moves", async () => {
        const theirs = [
            await order("PREPARING", { ctx: other }),
            await order("PREPARING", { ctx: other }),
        ];
        const done = await batches.create(owner, {
            batchId: randomUUID(),
            lines: lines(theirs, "PREPARING", "READY"),
            now: true,
        });
        expect(done.lines.map((l) => l.result)).toEqual([
            "NOT_FOUND",
            "NOT_FOUND",
        ]);
        expect(await stages(theirs)).toEqual(["PREPARING", "PREPARING"]);
        // And their batch can't be read from here.
        await expect(batches.get(other, done.id)).rejects.toThrow(/isn't here/);
    });

    it("names an order the step refuses (not paid yet) and moves the rest", async () => {
        const ids = [await order("NEW", { paid: false }), await order("NEW")];
        const done = await batches.create(owner, {
            batchId: randomUUID(),
            lines: lines(ids, "NEW", "PREPARING"),
            now: true,
        });
        expect(done.lines.map((l) => [l.result, l.reason])).toEqual([
            ["REFUSED", "not paid yet"],
            ["MOVED", null],
        ]);
    });

    it("needs order:stage: a Reviewer is refused", async () => {
        const id = await order("PREPARING");
        await expect(
            batches.create(reviewer, {
                batchId: randomUUID(),
                lines: lines([id], "PREPARING", "READY"),
            }),
        ).rejects.toThrow(ForbiddenException);
    });
});
