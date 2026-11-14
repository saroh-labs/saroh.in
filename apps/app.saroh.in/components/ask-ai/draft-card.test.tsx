// @vitest-environment jsdom
/**
 * A draft card (plan 2026-11-13-001 U10, boards 4, 5, 14–16): old → new,
 * a missing field typed on the card before Confirm, the button says the
 * outcome; Confirm on an edit is Done with Undo, on a create Added with
 * Open it (never Undo); Saroh's refusals land inside the card; Undo is gone
 * after the business's day. Values are text, links are app routes.
 */
import type { AskAiDraftCard, AskAiDraftResult } from "@saroh/api-contract";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
    confirmDraft: vi.fn(),
    undoDraft: vi.fn(),
    redraftDraft: vi.fn(),
}));
vi.mock("@/lib/ask-ai/panel-actions", () => actions);
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
    }: {
        href: string;
        children: React.ReactNode;
    }) => <a href={href}>{children}</a>,
}));

import { DraftCard } from "./draft-card";

const EDIT: AskAiDraftCard = {
    draftId: "d1",
    tool: "update_service",
    kind: "service",
    action: "edit",
    status: "drafted",
    targetId: "svc_1",
    targetName: "Haircut",
    fields: [{ field: "price", label: "Price (INR)", old: 500, new: 600 }],
    missing: [],
    refusal: null,
    note: null,
    expiresAt: "2026-11-14T18:30:00.000Z",
};

const CREATE: AskAiDraftCard = {
    ...EDIT,
    draftId: "d2",
    tool: "create_product",
    kind: "product",
    action: "create",
    targetId: null,
    targetName: "Kaju pista cookies",
    fields: [
        { field: "name", label: "Name", old: null, new: "Kaju pista cookies" },
        { field: "price", label: "Price (INR)", old: null, new: null },
    ],
    missing: [{ field: "price", label: "Price (INR)" }],
};

const result = (
    card: AskAiDraftCard,
    over: Partial<AskAiDraftResult>,
): { ok: true; data: AskAiDraftResult } => ({
    ok: true,
    data: {
        outcome: "done",
        card,
        words: "Done.",
        canUndo: true,
        open: null,
        ...over,
    },
});

let root: Root;
let host: HTMLDivElement;
const text = () => host.textContent;
const button = (name: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
const link = (name: string) =>
    Array.from(host.querySelectorAll("a")).find(
        (a) => a.textContent.trim() === name,
    );

async function settle() {
    await act(async () => {
        for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    });
}

function render(card: AskAiDraftCard, now = new Date("2026-11-14T10:00:00Z")) {
    act(() => root.render(<DraftCard card={card} now={() => now} />));
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.clearAllMocks();
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

describe("an edit", () => {
    it("shows old → new and says the outcome on the button", () => {
        render(EDIT);
        expect(host.querySelector(".line-through")?.textContent).toBe("500");
        expect(text()).toContain("600");
        expect(text()).toContain("Change service");
        expect(text()).toContain("Not changed yet");
    });

    it("Confirm → Done with Open and Undo; Undo puts it back", async () => {
        actions.confirmDraft.mockResolvedValue(
            result({ ...EDIT, status: "confirmed" }, { outcome: "done" }),
        );
        actions.undoDraft.mockResolvedValue(
            result(
                { ...EDIT, status: "undone" },
                {
                    outcome: "undone",
                    words: "Put back as it was.",
                    canUndo: false,
                },
            ),
        );
        render(EDIT);
        act(() => button("Change service")?.click());
        await settle();
        expect(actions.confirmDraft).toHaveBeenCalledWith("d1", undefined);
        expect(text()).toContain("Done · Haircut");
        expect(link("Open service")?.getAttribute("href")).toBe(
            "/services/svc_1",
        );

        act(() => button("Undo")?.click());
        await settle();
        expect(actions.undoDraft).toHaveBeenCalledWith("d1");
        expect(text()).toContain("Put back as it was.");
    });

    it("a confirmed edit read back after its day has no Undo", () => {
        render(
            { ...EDIT, status: "confirmed" },
            new Date("2026-11-15T10:00:00Z"),
        );
        expect(text()).toContain("Done · Haircut");
        expect(button("Undo")).toBeUndefined();
    });
});

describe("a create", () => {
    it("waits for the missing field, sends it as a number, then Added with Open it", async () => {
        actions.confirmDraft.mockResolvedValue(
            result(
                { ...CREATE, status: "confirmed", missing: [] },
                {
                    outcome: "added",
                    canUndo: false,
                    open: { kind: "product", id: "prd_9" },
                },
            ),
        );
        render(CREATE);
        const add = button("Add product");
        expect(add?.disabled).toBe(true);
        expect(text()).toContain("Needed to add it");

        const input = host.querySelector("input");
        if (!input) throw new Error("no field");
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(input, "250");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(button("Add product")?.disabled).toBe(false);
        act(() => button("Add product")?.click());
        await settle();

        expect(actions.confirmDraft).toHaveBeenCalledWith("d2", { price: 250 });
        expect(text()).toContain("Added · Kaju pista cookies");
        expect(link("Open it")?.getAttribute("href")).toBe(
            "/commerce/products/prd_9",
        );
        expect(button("Undo")).toBeUndefined();
    });
});

describe("refused by Saroh", () => {
    it("a duplicate offers the one the business has", () => {
        render({
            ...CREATE,
            status: "refused",
            missing: [],
            refusal: {
                reason: "duplicate",
                words: 'You already have "Chocolate truffle cake". Open the one you have instead.',
                existingId: "prd_1",
            },
        });
        expect(text()).toContain("Not added");
        expect(text()).toContain("You already have");
        expect(link("Open the one you have")?.getAttribute("href")).toBe(
            "/commerce/products/prd_1",
        );
    });

    it("changed since drafted: Draft again, which doesn't use a question", async () => {
        actions.redraftDraft.mockResolvedValue(
            result({ ...EDIT, draftId: "d3" }, { outcome: "drafted" }),
        );
        render({
            ...EDIT,
            status: "refused",
            refusal: {
                reason: "changed",
                words: "Changed since this was drafted.",
                existingId: null,
            },
        });
        expect(text()).toContain("Draft again doesn't use a question.");
        act(() => button("Draft again")?.click());
        await settle();
        expect(actions.redraftDraft).toHaveBeenCalledWith("d1");
        expect(button("Change service")).toBeDefined();
    });

    it("a plan limit says the API's words and the way up", () => {
        render({
            ...CREATE,
            status: "refused",
            missing: [],
            refusal: {
                reason: "plan-limit",
                words: "Your plan's products are all in use. Nothing was saved.",
                existingId: null,
            },
        });
        expect(text()).toContain("Your plan's products are all in use.");
        expect(link("See plans")).toBeDefined();
    });
});

it("draws values as text, never markup", () => {
    render({
        ...EDIT,
        fields: [
            {
                field: "name",
                label: "Name",
                old: "A",
                new: '<img src="https://evil.example/x">',
            },
        ],
    });
    expect(host.querySelector("img")).toBeNull();
    expect(text()).toContain('<img src="https://evil.example/x">');
});
