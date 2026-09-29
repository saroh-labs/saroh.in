import { describe, expect, it } from "vitest";

import type { PlanEditorRecord } from "./plan-drafts";
import type { PlanForm, ProblemContext } from "./plan-editor";
import {
    changesNote,
    clashOf,
    editorRecordOf,
    EMPTY_PLAN,
    everyNote,
    formOf,
    glance,
    parsePrice,
    payloadOf,
    planBlocker,
    planChanges,
    planProblems,
    publishedText,
    whoPays,
} from "./plan-editor";

const form = (over: Partial<PlanForm> = {}): PlanForm => ({
    name: "Monthly",
    description: "Gym floor and classes",
    price: "1200",
    currency: "INR",
    interval: "MONTH",
    classes: "8",
    ...over,
});

const ctx = (over: Partial<ProblemContext> = {}): ProblemContext => ({
    withClasses: true,
    otherClasses: false,
    takenNames: [],
    clash: null,
    ...over,
});

const live: PlanEditorRecord = {
    id: "plan_1",
    status: "ACTIVE",
    hasPendingChanges: true,
    revision: 5,
    values: {
        name: "Monthly",
        description: null,
        price: "1500.00",
        currency: "INR",
        interval: "MONTH",
        classesPerMonth: 10,
    },
    published: {
        name: "Monthly",
        description: null,
        price: "1200.00",
        currency: "INR",
        interval: "MONTH",
        classesPerMonth: 8,
    },
    canDelete: false,
    problems: [],
    pendingChangedAt: "2026-10-15T10:00:00.000Z",
};

describe("the form and D5's values", () => {
    it("reads a live plan's pending values over what's published", () => {
        const rec = editorRecordOf(live);
        expect(rec.values).toMatchObject({ price: "1500", classes: "10" });
        expect(rec.published).toMatchObject({ price: "1200", classes: "8" });
        expect(rec).toMatchObject({ revision: 5, hasPendingChanges: true });
    });

    it("shows an unpriced draft's price as empty, and unlimited as no count", () => {
        expect(
            formOf({ ...live.values, price: null, classesPerMonth: null }),
        ).toMatchObject({ price: "", classes: "", description: "" });
    });

    it("sends a price as the API takes it, and nothing typed as null", () => {
        expect(payloadOf(form({ price: "1,200.50" }))).toMatchObject({
            price: "1200.50",
            classesPerMonth: 8,
        });
        expect(
            payloadOf(form({ price: "", classes: "", description: "  " })),
        ).toMatchObject({
            price: null,
            classesPerMonth: null,
            description: null,
        });
    });

    it("leaves a new plan's currency to the API (the business's)", () => {
        expect(payloadOf({ ...EMPTY_PLAN, name: "New" })).not.toHaveProperty(
            "currency",
        );
    });

    it("refuses a price with three decimals rather than rounding it", () => {
        expect(parsePrice("12.345")).toBeNull();
        expect(parsePrice("₹ 1,200")).toBe("1200");
    });
});

describe("what stops Publish", () => {
    it("names a plan's name another plan has, beside the field", () => {
        expect(
            planProblems(
                form({ name: "drop-in " }),
                ctx({ takenNames: ["Drop-in"] }),
            ),
        ).toEqual([
            { field: "name", message: "There's already a plan called Drop-in" },
        ]);
    });

    it("keeps the server's clash only while the name on screen is that one", () => {
        const clash = clashOf({
            ...live,
            values: { ...live.values, name: "Unlimited" },
            problems: [
                {
                    field: "name",
                    message: "There is already a plan called Unlimited.",
                },
            ],
        });
        expect(
            planProblems(form({ name: "Unlimited" }), ctx({ clash })),
        ).toHaveLength(1);
        expect(
            planProblems(form({ name: "Unlimited 2" }), ctx({ clash })),
        ).toEqual([]);
    });

    it("asks for a price, and a count once Other… is chosen", () => {
        const got = planProblems(
            form({ price: "0", classes: "" }),
            ctx({ otherClasses: true }),
        );
        expect(got.map((p) => p.field)).toEqual(["price", "classes"]);
        expect(planProblems(form({ classes: "70" }), ctx())[0]?.message).toBe(
            "60 a month is the most",
        );
    });

    it("never judges classes where the business doesn't sell them", () => {
        expect(
            planProblems(form({ classes: "70" }), ctx({ withClasses: false })),
        ).toEqual([]);
    });

    it("holds back a save the API would refuse, and a draft with no name", () => {
        expect(planBlocker(form({ name: " " }), ctx())).toBe(
            "Add a name to save the draft",
        );
        expect(planBlocker(form({ price: "12.345" }), ctx())).toMatch(
            /Fix the price/,
        );
        expect(
            planBlocker(form({ classes: "" }), ctx({ otherClasses: true })),
        ).toMatch(/how many classes/);
        expect(planBlocker(form(), ctx())).toBeNull();
    });
});

describe("the publish banner", () => {
    it("lists each change in the design's words", () => {
        expect(
            planChanges(
                form(),
                form({
                    price: "1500",
                    interval: "YEAR",
                    classes: "",
                    name: "Monthly plus",
                    description: "More",
                }),
                true,
            ),
        ).toEqual([
            "price ₹1,200 → ₹1,500 for new sign-ups",
            "charged every year instead of every month",
            "8 classes a month → unlimited classes",
            "renamed to Monthly plus",
            "new description",
        ]);
    });

    it("says nothing of classes where they aren't sold", () => {
        expect(planChanges(form(), form({ classes: "10" }), false)).toEqual([]);
    });

    it("tells who keeps what: prices stay, classes from their next renewal", () => {
        expect(changesNote(form(), form({ price: "1500" }), 12)).toBe(
            "The 12 already on it keep what they agreed to — nobody's price changes under them.",
        );
        expect(changesNote(form(), form({ classes: "10" }), 12)).toMatch(
            /Their classes change from their next renewal\.$/,
        );
        expect(changesNote(form(), form({ price: "1500" }), 0)).toBe("");
    });

    it("words the publish toast for a draft and for a live plan", () => {
        expect(publishedText("Monthly", false, 0)).toBe(
            "Monthly is open for sign-ups.",
        );
        expect(publishedText("Monthly", true, 12)).toBe(
            "Changes published. The 12 already on it keep what they pay now.",
        );
    });
});

describe("how it's paid, and the side panel", () => {
    it("never promises autopay until the provider takes mandates (DEC-038)", () => {
        expect(everyNote(form())).toBe("Invoiced each month with a pay link.");
        expect(everyNote(form(), true)).toMatch(/or by autopay/);
        expect(everyNote(form({ price: "12000", interval: "YEAR" }))).toBe(
            "Works out to ₹1,000 a month. Invoiced each year with a pay link.",
        );
        expect(everyNote(form({ price: "" }))).toBe("");
    });

    it("reads At a glance from the form and the plan's figures", () => {
        const figures = {
            subscriberCount: 15,
            monthlyFromMembers: "17400.00",
            currency: "INR",
            byPrice: [
                {
                    price: "1500.00",
                    currency: "INR",
                    interval: "MONTH" as const,
                    count: 12,
                    current: true,
                },
                {
                    price: "1200.00",
                    currency: "INR",
                    interval: "MONTH" as const,
                    count: 3,
                    current: false,
                },
            ],
        };
        expect(
            glance(form({ price: "3000", interval: "QUARTER" }), figures),
        ).toEqual([
            { label: "Per month", value: "₹1,000" },
            { label: "On it now", value: "15" },
            { label: "Coming in a month", value: "₹17,400" },
        ]);
        expect(whoPays(figures)).toEqual([
            { label: "12 people", value: "₹1,500" },
            { label: "3 people · older price", value: "₹1,200" },
        ]);
        expect(glance(form({ price: "" }), null)).toEqual([
            { label: "Per month", value: "—" },
            { label: "On it now", value: "0" },
            { label: "Coming in a month", value: "—" },
        ]);
    });
});
