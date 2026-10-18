// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SetupDraft, SetupValues } from "./setup-steps";
import {
    clearSetupDraft,
    firstUnanswered,
    openStep,
    planFor,
    readSetupDraft,
    SETUP_DRAFT_KEY,
    SETUP_STEPS,
    stepAfter,
    stepBefore,
    stepCount,
    stepEyebrow,
    stepFromQuery,
    stepHeading,
    stepHref,
    stepLead,
    stepOfField,
    stepPosition,
    stepPrimary,
    writeSetupDraft,
} from "./setup-steps";

const ANSWERED: SetupValues = {
    kind: "BUSINESS",
    yourName: "",
    name: "Rye & Co. Bakery",
    address: "rye-co-bakery",
    country: "IN",
    goal: "COMMERCE",
};

describe("the one list of steps", () => {
    // The same four strings the sign-up panel is pinned to
    // (`apps/accounts.saroh.in/components/auth/panel-copy.test.ts`).
    it("is the plan the sign-up page gives, after the account", () => {
        expect(planFor("kind").steps).toEqual([
            "Make your account",
            "Say what you are setting up",
            "Give it a name and a web address",
            "Pick what to do first",
        ]);
        expect(SETUP_STEPS.map((s) => [s.id, s.plan])).toEqual([
            ["kind", "Say what you are setting up"],
            ["name", "Give it a name and a web address"],
            ["first", "Pick what to do first"],
        ]);
    });

    it("marks the step on show in the plan, the account done", () => {
        expect(planFor("kind").current).toBe(2);
        expect(planFor("name").current).toBe(3);
        expect(planFor("first").current).toBe(4);
    });

    it("gives each answer to one step", () => {
        expect(stepOfField("kind")).toBe("kind");
        for (const field of ["yourName", "name", "address", "country"]) {
            expect(stepOfField(field)).toBe("name");
        }
        expect(stepOfField("goal")).toBe("first");
        expect(stepOfField("nope")).toBeNull();
    });

    it("knows the step before and after", () => {
        expect(stepBefore("kind")).toBeNull();
        expect(stepBefore("first")).toBe("name");
        expect(stepAfter("kind")).toBe("name");
        expect(stepAfter("first")).toBeNull();
    });
});

describe("where the person is", () => {
    it("counts the account for a first business, and only setup's own for another", () => {
        expect(stepCount("kind", false)).toBe("Step 2 of 4");
        expect(stepCount("name", false)).toBe("Step 3 of 4");
        expect(stepCount("first", false)).toBe("Step 4 of 4");
        expect(stepPosition("first", false)).toEqual({ now: 4, of: 4 });
        expect(stepCount("kind", true)).toBe("Step 1 of 3");
        expect(stepEyebrow("first", true)).toBe("Set up another · Step 3 of 3");
        expect(stepEyebrow("kind", false)).toBe("Step 2 of 4");
    });

    it("words the name step for the kind, and the questions the same for all", () => {
        expect(stepHeading("kind", "SOLO")).toBe("What are you setting up?");
        expect(stepHeading("name", "BUSINESS")).toBe("Name your business");
        expect(stepHeading("name", "SOLO")).toBe("Name it");
        expect(stepHeading("name", "WORK")).toBe("Name your site");
        expect(stepHeading("name", undefined)).toBe("Name your business");
        expect(stepHeading("first", "WORK")).toBe("What will you do first?");
    });

    it("says Continue until the last step, whose button creates", () => {
        expect(stepPrimary("kind", "BUSINESS")).toBe("Continue");
        expect(stepPrimary("name", "SOLO")).toBe("Continue");
        expect(stepPrimary("first", "BUSINESS")).toBe("Create the business");
        expect(stepPrimary("first", "SOLO")).toBe("Set it up");
        expect(stepPrimary("first", "WORK")).toBe("Set it up");
    });

    it("writes every sentence without a dash or a semicolon", () => {
        for (const step of ["kind", "name", "first"] as const) {
            for (const another of [true, false]) {
                expect(stepLead(step, another)).toMatch(/\.$/);
                expect(stepLead(step, another)).not.toMatch(/[—;]/);
            }
        }
    });
});

describe("the step in the address", () => {
    it("reads a known step, and anything else as the first", () => {
        expect(stepFromQuery("name")).toBe("name");
        expect(stepFromQuery("first")).toBe("first");
        expect(stepFromQuery(["first", "name"])).toBe("first");
        for (const raw of [undefined, null, "", "2", "KIND", "create"]) {
            expect(stepFromQuery(raw)).toBe("kind");
        }
    });

    it("keeps the rest of the address, and leaves the first step bare", () => {
        expect(stepHref("https://app.saroh.in/onboarding", "name")).toBe(
            "/onboarding?step=name",
        );
        expect(
            stepHref(
                "https://app.saroh.in/onboarding?plan=grow&cycle=month&step=name",
                "first",
            ),
        ).toBe("/onboarding?plan=grow&cycle=month&step=first");
        expect(
            stepHref(
                "https://app.saroh.in/onboarding?invite=abc&step=first",
                "kind",
            ),
        ).toBe("/onboarding?invite=abc");
    });
});

describe("who Saroh bills, asked of an owner with a profile (DEC-167)", () => {
    const billing = {
        profiles: [
            {
                id: "bprof_1",
                legalName: "Asha Foods LLP",
                gstin: null,
                address: null,
                billingEmail: "accounts@example.com",
            },
        ],
    };

    it("is a step between the name and what to do first, only when asked", () => {
        expect(stepAfter("name", true)).toBe("billing");
        expect(stepAfter("billing", true)).toBe("first");
        expect(stepBefore("first", true)).toBe("billing");
        expect(stepAfter("name")).toBe("first");
        expect(stepOfField("billingChoice")).toBe("billing");
        expect(stepOfField("billEmail")).toBe("billing");
        expect(stepFromQuery("billing")).toBe("billing");
    });

    it("counts it when asked, and leaves the plan's own steps as they are", () => {
        expect(stepEyebrow("billing", true, true)).toBe(
            "Set up another · Step 3 of 4",
        );
        expect(stepCount("first", true, true)).toBe("Step 4 of 4");
        expect(stepCount("first", false, true)).toBe("Step 5 of 5");
        expect(planFor("billing").current).toBe(3);
        expect(stepHeading("billing", "BUSINESS")).toBe(
            "Who does Saroh bill for this business?",
        );
        expect(stepLead("billing", true)).toMatch(/\.$/);
        expect(stepLead("billing", true)).not.toMatch(/[—;]/);
    });

    it("holds the last step back until it is answered", () => {
        expect(firstUnanswered(ANSWERED, false, billing)).toBe("billing");
        expect(openStep("first", ANSWERED, false, billing)).toBe("billing");
        const chosen = { ...ANSWERED, billingChoice: "bprof_1" };
        expect(firstUnanswered(chosen, false, billing)).toBeNull();
        expect(openStep("first", chosen, false, billing)).toBe("first");
    });

    it("an address for it where it isn't asked opens the step after it", () => {
        expect(openStep("billing", ANSWERED, false)).toBe("first");
    });
});

describe("which step may be shown", () => {
    it("finds the first step with an answer its gate would refuse", () => {
        expect(firstUnanswered(ANSWERED, false)).toBeNull();
        expect(firstUnanswered({ ...ANSWERED, name: " " }, false)).toBe("name");
        expect(firstUnanswered({ ...ANSWERED, address: "ab" }, false)).toBe(
            "name",
        );
        expect(firstUnanswered({ ...ANSWERED, kind: "SHOP" }, false)).toBe(
            "kind",
        );
        expect(firstUnanswered({ ...ANSWERED, goal: "" }, false)).toBe("first");
        // Your name is asked only of an account that has none.
        expect(firstUnanswered(ANSWERED, true)).toBe("name");
        expect(
            firstUnanswered({ ...ANSWERED, yourName: "Asha" }, true),
        ).toBeNull();
    });

    it("opens the step asked for only when the ones before it are answered", () => {
        const empty = { ...ANSWERED, name: "", address: "" };
        expect(openStep("first", ANSWERED, false)).toBe("first");
        expect(openStep("first", empty, false)).toBe("name");
        expect(openStep("name", empty, false)).toBe("name");
        expect(openStep("kind", empty, false)).toBe("kind");
        // The last step's own answer never sends it back.
        expect(openStep("first", { ...ANSWERED, goal: "" }, false)).toBe(
            "first",
        );
    });
});

describe("the draft", () => {
    const draft: SetupDraft = {
        values: ANSWERED,
        edited: true,
        goalPicked: false,
        otherCountry: false,
    };

    beforeEach(() => window.sessionStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it("comes back for the account that wrote it, in this tab", () => {
        writeSetupDraft("asha@example.com", draft);
        expect(readSetupDraft("asha@example.com")).toEqual(draft);
        expect(readSetupDraft("kiran@example.com")).toBeNull();
        clearSetupDraft();
        expect(readSetupDraft("asha@example.com")).toBeNull();
    });

    it("ignores what it can't read", () => {
        window.sessionStorage.setItem(SETUP_DRAFT_KEY, "{not json");
        expect(readSetupDraft("asha@example.com")).toBeNull();
        window.sessionStorage.setItem(
            SETUP_DRAFT_KEY,
            JSON.stringify({ for: "asha@example.com", values: { kind: "X" } }),
        );
        expect(readSetupDraft("asha@example.com")).toBeNull();
    });

    it("never throws where the browser refuses storage", () => {
        for (const method of ["getItem", "setItem", "removeItem"] as const) {
            vi.spyOn(Storage.prototype, method).mockImplementation(() => {
                throw new Error("SecurityError");
            });
        }
        expect(() => writeSetupDraft("asha@example.com", draft)).not.toThrow();
        expect(readSetupDraft("asha@example.com")).toBeNull();
        expect(() => clearSetupDraft()).not.toThrow();
    });
});
