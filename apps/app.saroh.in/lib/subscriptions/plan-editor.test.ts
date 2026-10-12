import { describe, expect, it } from "vitest";

import type { PlanEditorRecord } from "./plan-drafts";
import type { PlanForm, ProblemContext } from "./plan-editor";
import {
    autopayLimitWarning,
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
import type { RenewalChange } from "./renewal-change";

const form = (over: Partial<PlanForm> = {}): PlanForm => ({
    name: "Monthly",
    description: "Gym floor and classes",
    price: "1200",
    currency: "INR",
    interval: "MONTH",
    classes: "8",
    gstRate: "",
    sacCode: "",
    gstPriceMode: "",
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
        gstRate: null,
        sacCode: null,
        gstPriceMode: null,
    },
    published: {
        name: "Monthly",
        description: null,
        price: "1200.00",
        currency: "INR",
        interval: "MONTH",
        classesPerMonth: 8,
        gstRate: null,
        sacCode: null,
        gstPriceMode: null,
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
            "The 12 already on it keep what they agreed to. Nobody's price changes under them.",
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

describe("the autopay limit warning (D13)", () => {
    const limits = [
        { limit: "1300.00", members: 1 },
        { limit: "1500.00", members: 2 },
    ];

    it("counts the switchers whose autopay covers less than the price", () => {
        expect(
            autopayLimitWarning(form({ price: "1800" }), limits, "INR"),
        ).toBe(
            "Autopay covers up to ₹1,500, so 3 members will need to authorise again",
        );
        expect(
            autopayLimitWarning(form({ price: "1400" }), limits, "INR"),
        ).toBe(
            "Autopay covers up to ₹1,300, so 1 member will need to authorise again",
        );
    });

    it("says nothing when every limit covers the price, to the paisa", () => {
        expect(
            autopayLimitWarning(form({ price: "1300" }), limits, "INR"),
        ).toBe("");
        expect(
            autopayLimitWarning(form({ price: "1300.01" }), limits, "INR"),
        ).toMatch(/^Autopay covers up to ₹1,300, so 1 member/);
    });

    it("says nothing with no switchers, no price, or an older API", () => {
        expect(autopayLimitWarning(form({ price: "9000" }), [], "INR")).toBe(
            "",
        );
        expect(
            autopayLimitWarning(form({ price: "9000" }), undefined, "INR"),
        ).toBe("");
        expect(autopayLimitWarning(form({ price: "" }), limits, "INR")).toBe(
            "",
        );
        expect(autopayLimitWarning(form({ price: "abc" }), limits, "INR")).toBe(
            "",
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

describe("a plan's GST (12 Oct 2026)", () => {
    const ADDS: RenewalChange = {
        members: 12,
        groups: [
            { members: 12, currency: "INR", from: "1200.00", to: "1416.00" },
        ],
        changed: 12,
        aboveAutopayLimit: 0,
    };
    const SAME: RenewalChange = {
        members: 12,
        groups: [
            { members: 12, currency: "INR", from: "1200.00", to: "1200.00" },
        ],
        changed: 0,
        aboveAutopayLimit: 0,
    };

    it("reads the API's values into the fields, and nothing as not set", () => {
        expect(
            formOf({
                ...live.values,
                gstRate: "18.00",
                sacCode: "999723",
                gstPriceMode: "ADDED",
            }),
        ).toMatchObject({
            gstRate: "18",
            sacCode: "999723",
            gstPriceMode: "ADDED",
        });
        expect(formOf(live.values)).toMatchObject({
            gstRate: "",
            sacCode: "",
            gstPriceMode: "",
        });
        expect(EMPTY_PLAN).toMatchObject({
            gstRate: "",
            sacCode: "",
            gstPriceMode: "",
        });
    });

    it("sends them as the API takes them: null is not set, or the same as the business", () => {
        expect(payloadOf(form())).toMatchObject({
            gstRate: null,
            sacCode: null,
            gstPriceMode: null,
        });
        expect(
            payloadOf(
                form({
                    gstRate: "18",
                    sacCode: " 9997 23 ",
                    gstPriceMode: "ADDED",
                }),
            ),
        ).toMatchObject({
            gstRate: "18",
            sacCode: "999723",
            gstPriceMode: "ADDED",
        });
        // Exempt is a rate of its own, never "not set".
        expect(payloadOf(form({ gstRate: "0" })).gstRate).toBe("0");
    });

    it("leaves out a SAC code the API would refuse, so the rest still saves", () => {
        const sent = payloadOf(form({ gstRate: "18", sacCode: "99" }));
        expect("sacCode" in sent).toBe(false);
        expect(sent.gstRate).toBe("18");
    });

    it("asks a registered business's priced plan for its rate, and takes 0%", () => {
        const asked = ctx({ gstAsked: true });
        expect(planProblems(form(), asked)).toContainEqual({
            field: "gstRate",
            // The shell ends the sentence itself, as it does "Add the price".
            message: "Choose a GST rate. Pick 0% if it's exempt or nil-rated",
            // What a published plan opened without one says instead, until
            // the field is left or Publish is pressed.
            note: "This plan has no GST rate yet. Choose one before you publish again.",
        });
        expect(planProblems(form({ gstRate: "0" }), asked)).toEqual([]);
        expect(planProblems(form({ gstRate: "18" }), asked)).toEqual([]);
        // Not priced yet: the price is asked for, the rate isn't.
        expect(
            planProblems(form({ price: "" }), asked).map((p) => p.field),
        ).toEqual(["price"]);
    });

    it("never asks a business that isn't registered, and never blocks it", () => {
        expect(planProblems(form(), ctx())).toEqual([]);
        expect(planProblems(form(), ctx({ gstAsked: false }))).toEqual([]);
        expect(planProblems(form({ sacCode: "99" }), ctx())).toEqual([]);
    });

    it("says a SAC code that isn't four to eight digits", () => {
        expect(
            planProblems(
                form({ gstRate: "18", sacCode: "99" }),
                ctx({ gstAsked: true }),
            ),
        ).toEqual([
            { field: "sacCode", message: "A SAC code is 4 to 8 digits" },
        ]);
    });

    it("lists a GST change under When you publish", () => {
        expect(planChanges(form(), form({ gstRate: "18" }), true)).toEqual([
            "GST rate not set → 18%",
        ]);
        expect(
            planChanges(
                form({ gstRate: "18" }),
                form({ gstRate: "18", gstPriceMode: "ADDED" }),
                true,
            ),
        ).toEqual(["GST on this price: GST is added"]);
        expect(
            planChanges(
                form({ gstRate: "18", sacCode: "999723" }),
                form({ gstRate: "12", sacCode: "" }),
                true,
            ),
        ).toEqual(["GST rate 18% → 12%", "SAC code 999723 → not set"]);
    });

    it("never says members keep what they pay when their renewal changes", () => {
        const note = changesNote(form(), form({ gstRate: "18" }), 12, ADDS);
        expect(note).toBe(
            "The 12 already on it keep the price they joined at. The GST changes what they pay from their next renewal.",
        );
        expect(note).not.toContain("Nobody's price changes");
        expect(changesNote(form(), form({ gstRate: "18" }), 12, SAME)).toBe(
            "The 12 already on it keep the price they joined at. Their next renewal stays the same amount.",
        );
        // With no GST change, as it always was.
        expect(changesNote(form(), form({ price: "1500" }), 12)).toBe(
            "The 12 already on it keep what they agreed to. Nobody's price changes under them.",
        );
    });

    it("says what a publish did to the members on it", () => {
        expect(publishedText("Monthly", true, 12, ADDS)).toBe(
            "Changes published. The 12 already on it pay the new amount from their next renewal.",
        );
        expect(publishedText("Monthly", true, 12, SAME)).toBe(
            "Changes published. The 12 already on it pay the same amount at their next renewal.",
        );
        expect(publishedText("Monthly", true, 12)).toBe(
            "Changes published. The 12 already on it keep what they pay now.",
        );
        expect(publishedText("Monthly", false, 0, ADDS)).toBe(
            "Monthly is open for sign-ups.",
        );
    });

    it("warns switchers by the amount with GST on top, where GST is added", () => {
        const limits = [{ limit: "1300.00", members: 2 }];
        // ₹1,200 is under the limit as typed.
        expect(autopayLimitWarning(form(), limits, "INR")).toBe("");
        expect(
            autopayLimitWarning(form({ gstRate: "18" }), limits, "INR", {
                asked: true,
                priceMode: "INCLUDED",
            }),
        ).toBe("");
        // ₹1,200 + 18% is ₹1,416: over it.
        expect(
            autopayLimitWarning(form({ gstRate: "18" }), limits, "INR", {
                asked: true,
                priceMode: "ADDED",
            }),
        ).toBe(
            "Autopay covers up to ₹1,300, so 2 members will need to authorise again",
        );
        // The plan's own way wins over the business's.
        expect(
            autopayLimitWarning(
                form({ gstRate: "18", gstPriceMode: "ADDED" }),
                limits,
                "INR",
                { asked: true, priceMode: "INCLUDED" },
            ),
        ).toContain("2 members will need to authorise again");
        // Not registered: the typed price stands.
        expect(
            autopayLimitWarning(
                form({ gstRate: "18", gstPriceMode: "ADDED" }),
                limits,
                "INR",
                { asked: false, priceMode: null },
            ),
        ).toBe("");
    });
});
