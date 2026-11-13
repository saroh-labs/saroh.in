/**
 * Ask AI's drafts (plan 2026-11-13-001 U5), the parts that need no
 * database: the card's old → new fields, "changed since", the fields a
 * person fills in, how a refusal is worded, the day a draft ends, and each
 * write tool's Undo. Confirm, Undo and the rolled-back dry run run against
 * Postgres in `drafts.db.spec.ts`.
 */
jest.mock("@saroh/database", () => ({
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
    outsideOrgContext: (fn: () => unknown) => fn(),
    prisma: {},
}));

import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { AskAiDraftCard } from "@saroh/api-contract";
import { createProductTool } from "@saroh/api-contract";

import { PLAN_LIMIT_REACHED } from "../../billing/plan-limit-errors";
import type { McpTool } from "../../mcp/tool-registry";
import { ToolError } from "../../mcp/tool-registry";
import { ASK_AI_DRAFT_TOOLS } from "../agents/ask-ai.agent";
import type { TargetState } from "./draft-targets";
import { DRAFT_SPECS } from "./draft-targets";
import {
    changedSince,
    endOfBusinessDay,
    fieldsOf,
    filled,
    missingOf,
    refusalOf,
} from "./drafts.service";

const state = (
    fields: Record<string, unknown>,
    more: Partial<TargetState> = {},
): TargetState => ({
    name: "Sourdough",
    updatedAt: "2026-11-13T10:00:00.000Z",
    fields,
    ...more,
});

const createProduct = {
    name: "create_product",
    contract: createProductTool,
} as unknown as McpTool;

const card = (missing: string[]): AskAiDraftCard => ({
    draftId: "d1",
    tool: "create_product",
    kind: "product",
    action: "create",
    status: "drafted",
    targetId: null,
    targetName: "Sourdough",
    fields: [],
    missing: missing.map((field) => ({ field, label: field })),
    refusal: null,
    note: null,
    expiresAt: "2026-11-13T23:59:59.999Z",
});

describe("fieldsOf: every field that will change, old → new", () => {
    it("an edit shows only what differs, money labelled with its currency", () => {
        const before = state(
            { name: "Sourdough", price: 180, status: "draft" },
            { currency: "INR" },
        );
        const after = state(
            { name: "Sourdough", price: 200, status: "published" },
            { currency: "INR" },
        );
        expect(fieldsOf(before, after)).toEqual([
            { field: "price", label: "Price (INR)", old: 180, new: 200 },
            {
                field: "status",
                label: "Status",
                old: "draft",
                new: "published",
            },
        ]);
    });

    it("an edit a customer's words slipped extra changes into shows them all", () => {
        const before = state({ price: 180, description: "Crusty" });
        const after = state({ price: 1, description: "Free today" });
        expect(fieldsOf(before, after).map((f) => f.field)).toEqual([
            "price",
            "description",
        ]);
    });

    it("a create shows every field with a value, none empty", () => {
        const after = state({
            name: "Sourdough",
            price: 180,
            description: null,
            stock: null,
            items: [],
        });
        expect(fieldsOf(null, after)).toEqual([
            { field: "name", label: "Name", old: null, new: "Sourdough" },
            { field: "price", label: "Price", old: null, new: 180 },
        ]);
    });
});

describe("changedSince", () => {
    const then = state({ price: 180 }, { restore: { starts_at: "a" } });

    it("is false for the same row and values", () => {
        expect(changedSince(then, state({ price: 180 }, then))).toBe(false);
    });

    it("is true when the row was saved again, a value moved, or the exact start did", () => {
        expect(
            changedSince(then, { ...then, updatedAt: "2026-11-13T11:00:00Z" }),
        ).toBe(true);
        expect(changedSince(then, { ...then, fields: { price: 190 } })).toBe(
            true,
        );
        expect(
            changedSince(then, { ...then, restore: { starts_at: "b" } }),
        ).toBe(true);
    });
});

describe("missing fields: asked on the card, filled by the person", () => {
    it("a product without a price asks for it", () => {
        expect(
            missingOf(createProduct, { request_id: "r", name: "Sourdough" }, [
                "name",
                "price",
            ]),
        ).toEqual(["price"]);
    });

    it("a wrong value, or a field the person can't type, is the model's to fix", () => {
        expect(
            missingOf(
                createProduct,
                { request_id: "r", name: "Sourdough", price: "lots" },
                ["name", "price"],
            ),
        ).toEqual([]);
        expect(
            missingOf(createProduct, { name: "Sourdough", price: 1 }, [
                "name",
                "price",
            ]),
        ).toEqual([]);
    });

    it("takes only the card's missing fields, checked; ignores anything else sent", () => {
        expect(
            filled(createProduct, card(["price"]), {
                fields: { price: 180, name: "Free cake", status: "published" },
            }),
        ).toEqual({ values: { price: 180 } });
        expect(
            filled(createProduct, card(["price"]), { fields: { price: -1 } }),
        ).toEqual({ missing: "price" });
        expect(filled(createProduct, card(["price"]), {})).toEqual({
            missing: "price",
        });
    });
});

describe("refusalOf: what a card says, and what goes back to the model", () => {
    const product = DRAFT_SPECS.create_product;
    const booking = DRAFT_SPECS.create_booking;

    it("a plan limit is the card's, in the plan's own words", () => {
        const error = new ForbiddenException({
            message: "You've reached your products limit",
            details: { code: PLAN_LIMIT_REACHED },
        });
        expect(refusalOf(error, product)).toEqual({
            reason: "plan-limit",
            words: "You've reached your products limit Nothing was saved.",
            existingId: null,
        });
    });

    it("a conflict is a duplicate only for a create that can repeat one", () => {
        const error = new ConflictException("That email is taken.");
        expect(refusalOf(error, DRAFT_SPECS.create_customer)?.reason).toBe(
            "duplicate",
        );
        expect(refusalOf(error, booking)).toBeNull();
    });

    it("anything else goes back to the model to fix", () => {
        expect(refusalOf(new ToolError("That time is taken."), booking)).toBe(
            null,
        );
    });
});

describe("a draft lasts until the end of the business's day", () => {
    it("ends at midnight in the business's zone", () => {
        // 20:00 UTC is 01:30 the next morning in India.
        expect(
            endOfBusinessDay(
                new Date("2026-11-13T20:00:00Z"),
                "Asia/Kolkata",
            ).toISOString(),
        ).toBe("2026-11-14T18:29:59.999Z");
    });

    it("a zone Saroh can't read counts in UTC", () => {
        expect(
            endOfBusinessDay(
                new Date("2026-11-13T20:00:00Z"),
                "Not/AZone",
            ).toISOString(),
        ).toBe("2026-11-13T23:59:59.999Z");
    });
});

describe("each write tool's draft", () => {
    it("covers exactly Ask AI's draft tools", () => {
        expect(Object.keys(DRAFT_SPECS).sort()).toEqual(
            [...ASK_AI_DRAFT_TOOLS].sort(),
        );
    });

    it("creates have no Undo; edits name their record", () => {
        for (const [name, spec] of Object.entries(DRAFT_SPECS)) {
            const create = name.startsWith("create_");
            expect(!spec.targetOf).toBe(create);
            expect(!!spec.madeOf).toBe(create);
            if (create) expect(spec.undo).toBeUndefined();
        }
    });

    it("a product edit is undone through update_product, with only what changed", () => {
        const before = state({
            name: "Sourdough",
            price: 180,
            description: null,
            status: "draft",
            stock: 4,
        });
        const after = state({ ...before.fields, price: 200, description: "x" });
        expect(DRAFT_SPECS.update_product.undo?.("p1", before, after)).toEqual({
            tool: "update_product",
            input: { product_id: "p1", price: 180, description: "" },
        });
    });

    it("a change Saroh's tools can't take back says so", () => {
        const before = state({ price: null });
        const after = state({ price: 500 });
        expect(
            DRAFT_SPECS.update_service.undo?.("s1", before, after),
        ).toMatchObject({ cannot: expect.any(String) });
        expect(
            DRAFT_SPECS.update_product.undo?.(
                "p1",
                state({ stock: null }),
                state({ stock: 3 }),
            ),
        ).toMatchObject({ cannot: expect.any(String) });
    });

    it("a booking moves back to its exact start; an order step through undoStage", () => {
        const before = state(
            { when: "Thu 14 Nov, 15:30" },
            { restore: { starts_at: "2026-11-14T10:00:00.000Z" } },
        );
        expect(
            DRAFT_SPECS.move_booking.undo?.("b1", before, state({})),
        ).toEqual({
            tool: "move_booking",
            input: { booking_id: "b1", starts_at: "2026-11-14T10:00:00.000Z" },
        });
        expect(DRAFT_SPECS.move_booking.undoNote).toMatch(
            /already been told.*messages them again/,
        );
        expect(
            DRAFT_SPECS.update_order_status.undo?.("o1", before, before),
        ).toEqual({ orderStage: true });
    });
});
