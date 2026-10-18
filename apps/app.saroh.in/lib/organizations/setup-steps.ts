import {
    SETUP_PLAN,
    SETUP_PLAN_ACCOUNT_STEPS,
    stepLine,
} from "@saroh/ui/lib/setup-plan";
import { z } from "zod";

import type { OrganizationKind } from "./kind";
import { kindOf, ORGANIZATION_KINDS } from "./kind";
import type { SetupBilling } from "./setup-billing";
import { BILLING_FIELDS, billingProblems } from "./setup-billing";

/**
 * Setup as a stepper (DEC-130, amended 11 Oct 2026): one question to a
 * screen, with Back and Continue, and only the question being asked on show.
 *
 * This file is the one list of steps. The form draws the step it names, the
 * panel beside it lists the same steps with the current one marked, the
 * progress bar and the line above the heading count them, and the address
 * (`?step=`) is read and written here. The names in the panel come from
 * `SETUP_PLAN` in `@saroh/ui`, which the sign-up page draws too.
 *
 * One step is asked only of some: "Who does Saroh bill for this
 * business?" (DEC-167, R7), between the name and what to do first, for an
 * owner who has a billing profile already. Someone with none gets their
 * first from the business, so is never asked. Every function that walks
 * the steps takes `billing`, whether it is asked, and leaves it out when
 * it isn't, so the plan's own three steps read as they always have.
 *
 * Pure and client-safe.
 */

/**
 * What a person answers at setup. One form holds it for every step.
 * `billing` is who Saroh may bill, when that is asked: the owner's
 * profiles, whose emails a new one can't reuse.
 */
export function setupSchema(
    needsName: boolean,
    billing: SetupBilling | null = null,
) {
    return z
        .object({
            // "A business" to start with (owner, 10 Oct): the answer is one
            // press to change.
            kind: z.enum(ORGANIZATION_KINDS),
            // Asked only of an account that has no name yet: one made with an
            // emailed code, which asks for nothing but the address.
            yourName: needsName
                ? z
                      .string()
                      .trim()
                      .min(1, { message: "Enter your name" })
                      .max(120)
                : z.string().optional(),
            name: z.string().trim().min(1, { message: "It needs a name" }),
            address: z.string().min(3, {
                message: "A web address needs at least 3 characters",
            }),
            country: z.string().length(2),
            // A goal's key, or "LATER".
            goal: z.string().min(1),
            // Who Saroh bills (DEC-167): a profile's id, or "new" with its
            // fields below. Checked only when asked.
            billingChoice: z.string().optional(),
            billLegalName: z.string().optional(),
            billEmail: z.string().optional(),
            billGstin: z.string().optional(),
            billState: z.string().optional(),
            billAddress: z.string().optional(),
            billCity: z.string().optional(),
            billPin: z.string().optional(),
        })
        .superRefine((values, ctx) => {
            if (!billing) return;
            for (const [field, message] of billingProblems(values, billing)) {
                ctx.addIssue({ code: "custom", path: [field], message });
            }
        });
}

export type SetupValues = z.infer<ReturnType<typeof setupSchema>>;
export type SetupField = keyof SetupValues;

/** Every step there is, in order. "billing" is asked only of some. */
export const SETUP_STEP_IDS = ["kind", "name", "billing", "first"] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

/** The plan's own steps, which everyone is asked. */
const PLAN_STEP_IDS = ["kind", "name", "first"] as const;

export interface SetupStep {
    id: SetupStepId;
    /** Its name in the plan beside the form. */
    plan: string;
    /** The answers it asks for: its gate checks these and no others. */
    fields: readonly SetupField[];
}

const FIELDS: Record<SetupStepId, readonly SetupField[]> = {
    kind: ["kind"],
    name: ["yourName", "name", "address", "country"],
    billing: BILLING_FIELDS,
    first: ["goal"],
};

/** Setup's steps, in order: the plan's, after the account's. */
export const SETUP_STEPS: readonly SetupStep[] = PLAN_STEP_IDS.map(
    (id, index) => ({
        id,
        plan: SETUP_PLAN[SETUP_PLAN_ACCOUNT_STEPS + index] ?? "",
        fields: FIELDS[id],
    }),
);

/**
 * Who Saroh bills: part of naming it in the plan beside the form, which
 * lists the plan's own steps.
 */
const BILLING_STEP: SetupStep = {
    id: "billing",
    plan: SETUP_PLAN[SETUP_PLAN_ACCOUNT_STEPS + 1] ?? "",
    fields: FIELDS.billing,
};

const WITH_BILLING: readonly SetupStep[] = [
    ...SETUP_STEPS.slice(0, 2),
    BILLING_STEP,
    ...SETUP_STEPS.slice(2),
];

/** The steps this person is asked, in order. */
export function setupSteps(billing = false): readonly SetupStep[] {
    return billing ? WITH_BILLING : SETUP_STEPS;
}

/** The answers a step asks for, whoever is asked it. */
export function fieldsOfStep(step: SetupStepId): readonly SetupField[] {
    return FIELDS[step];
}

const FIRST_STEP: SetupStepId = "kind";
const LAST_STEP: SetupStepId = "first";

/** Where a step is among those asked; -1 for one that isn't. */
export function stepIndex(step: SetupStepId, billing = false): number {
    return setupSteps(billing).findIndex((s) => s.id === step);
}

export function isLastStep(step: SetupStepId): boolean {
    return step === LAST_STEP;
}

/** The step before this one, or null on the first. */
export function stepBefore(
    step: SetupStepId,
    billing = false,
): SetupStepId | null {
    return setupSteps(billing)[stepIndex(step, billing) - 1]?.id ?? null;
}

/** The step after this one, or null on the last. */
export function stepAfter(
    step: SetupStepId,
    billing = false,
): SetupStepId | null {
    const at = stepIndex(step, billing);
    return at < 0 ? null : (setupSteps(billing)[at + 1]?.id ?? null);
}

/** The step that asks for a field: where its problem is shown. */
export function stepOfField(field: string): SetupStepId | null {
    return (
        WITH_BILLING.find((s) =>
            (s.fields as readonly string[]).includes(field),
        )?.id ?? null
    );
}

/* The address. */

/** The query parameter the step rides in: `/onboarding?step=name`. */
export const STEP_PARAM = "step";

/** The step an address asks for. Anything unknown is the first. */
export function stepFromQuery(
    raw: string | string[] | null | undefined,
): SetupStepId {
    const value = Array.isArray(raw) ? raw[0] : raw;
    return (SETUP_STEP_IDS as readonly string[]).includes(value ?? "")
        ? (value as SetupStepId)
        : FIRST_STEP;
}

/**
 * The same address on another step. Everything else in it stays: a plan or
 * an invite picked on saroh.in rides in the query to the end. The first
 * step is the bare address.
 */
export function stepHref(href: string, step: SetupStepId): string {
    const url = new URL(href, "https://app.invalid");
    if (step === FIRST_STEP) url.searchParams.delete(STEP_PARAM);
    else url.searchParams.set(STEP_PARAM, step);
    return `${url.pathname}${url.search}${url.hash}`;
}

/* Which step may be shown. */

/** The first step with an answer its gate would refuse, or null. */
export function firstUnanswered(
    values: unknown,
    needsName: boolean,
    billing: SetupBilling | null = null,
): SetupStepId | null {
    const result = setupSchema(needsName, billing).safeParse(values);
    if (result.success) return null;
    const wrong = new Set(result.error.issues.map((i) => String(i.path[0])));
    return (
        setupSteps(billing !== null).find((s) =>
            s.fields.some((f) => wrong.has(f)),
        )?.id ?? null
    );
}

/**
 * The step to show for the one asked for: itself when every step before it
 * is answered, else the first that is not. A link or a reload can ask for
 * the last step with nothing typed. It gets the first question, not a
 * Create button over an empty name.
 */
export function openStep(
    asked: SetupStepId,
    values: unknown,
    needsName: boolean,
    billing: SetupBilling | null = null,
): SetupStepId {
    const asks = billing !== null;
    // Who Saroh bills, asked for where it isn't asked: the step after it.
    const step = stepIndex(asked, asks) < 0 ? LAST_STEP : asked;
    const stuck = firstUnanswered(values, needsName, billing);
    return stuck && stepIndex(stuck, asks) < stepIndex(step, asks)
        ? stuck
        : step;
}

/* Where the person is. */

/**
 * The count above the heading and in the progress bar. A first business
 * counts the account it has just made ("Step 2 of 4"). Another one, set up
 * from the switcher, has only setup's own three.
 */
export function stepPosition(
    step: SetupStepId,
    another: boolean,
    billing = false,
): { now: number; of: number } {
    const before = another ? 0 : SETUP_PLAN_ACCOUNT_STEPS;
    return {
        now: before + stepIndex(step, billing) + 1,
        of: before + setupSteps(billing).length,
    };
}

/** "Step 2 of 4". */
export function stepCount(
    step: SetupStepId,
    another: boolean,
    billing = false,
): string {
    const { now, of } = stepPosition(step, another, billing);
    return stepLine(now, of);
}

/** The line above the heading. Another business says so on a phone too. */
export function stepEyebrow(
    step: SetupStepId,
    another: boolean,
    billing = false,
): string {
    const count = stepCount(step, another, billing);
    return another ? `Set up another · ${count}` : count;
}

/** The plan beside the form: every step's name, and the one they are on. */
export function planFor(step: SetupStepId): {
    steps: string[];
    current: number;
} {
    // Who Saroh bills is part of naming it there.
    const shown = step === "billing" ? "name" : step;
    return {
        steps: [...SETUP_PLAN],
        current: SETUP_PLAN_ACCOUNT_STEPS + stepIndex(shown) + 1,
    };
}

/* The words on each step, in the kind's own (DEC-070). */

const NAME_HEADING: Record<OrganizationKind, string> = {
    BUSINESS: "Name your business",
    SOLO: "Name it",
    WORK: "Name your site",
};

/** The step's heading: the one question it asks. */
export function stepHeading(step: SetupStepId, kind: unknown): string {
    if (step === "kind") return "What are you setting up?";
    if (step === "name") return NAME_HEADING[kindOf(kind)];
    if (step === "billing") return "Who does Saroh bill for this business?";
    return "What will you do first?";
}

/** The sentence under the heading. */
export function stepLead(step: SetupStepId, another: boolean): string {
    if (step === "kind") {
        return another
            ? "It sits beside the ones you have, and you switch between them from the top of the screen."
            : "It changes the words Saroh uses and what it suggests first, never what you can do. You can change it later in Settings.";
    }
    if (step === "name") {
        return "The name people see, and the web address your website lives at.";
    }
    if (step === "billing") {
        return "Saroh's invoices for its plan go to the billing profile you pick. Use one you have, or add one with its own GSTIN.";
    }
    return "It is set up with sensible defaults and opens ready to fill in. You can add the others whenever.";
}

/** The step's main button: Continue, and the create on the last. */
export function stepPrimary(step: SetupStepId, kind: unknown): string {
    if (!isLastStep(step)) return "Continue";
    return kindOf(kind) === "BUSINESS" ? "Create the business" : "Set it up";
}

/* The draft: what was typed, kept across a reload. */

/**
 * Kept in `sessionStorage`, so it lasts as long as the tab and never leaves
 * it. It holds the answers only: no code, no token (a plan or an invite
 * stays in the address), nothing secret. It is cleared when the business is
 * made and on signing out, and one written by another account is ignored.
 * Who Saroh bills is never kept: a billing email and a GSTIN stay out of
 * storage, and the step is asked again after a reload.
 */
export const SETUP_DRAFT_KEY = "saroh.setup-draft";

export interface SetupDraft {
    values: SetupValues;
    /** The web address was typed by hand, so it no longer follows the name. */
    edited: boolean;
    /** A goal was picked by hand, so a change of kind leaves it alone. */
    goalPicked: boolean;
    /** "Another country" is open. */
    otherCountry: boolean;
}

const draftSchema = z.object({
    for: z.string(),
    values: z.object({
        kind: z.enum(ORGANIZATION_KINDS),
        yourName: z.string().max(120).optional(),
        name: z.string().max(200),
        address: z.string().max(100),
        country: z.string().length(2),
        goal: z.string().min(1).max(40),
    }),
    edited: z.boolean(),
    goalPicked: z.boolean(),
    otherCountry: z.boolean(),
});

function storage(): Storage | null {
    try {
        return typeof window === "undefined" ? null : window.sessionStorage;
    } catch {
        // Blocked site data, or a private window that refuses it.
        return null;
    }
}

/** The draft this account left in this tab, or null. */
export function readSetupDraft(email: string): SetupDraft | null {
    try {
        const raw = storage()?.getItem(SETUP_DRAFT_KEY);
        if (!raw) return null;
        const parsed = draftSchema.safeParse(JSON.parse(raw));
        if (!parsed.success || parsed.data.for !== email) return null;
        const { for: _for, ...draft } = parsed.data;
        return draft;
    } catch {
        return null;
    }
}

export function writeSetupDraft(email: string, draft: SetupDraft): void {
    const values = Object.fromEntries(
        Object.entries(draft.values).filter(
            ([key]) => !(BILLING_FIELDS as readonly string[]).includes(key),
        ),
    );
    try {
        storage()?.setItem(
            SETUP_DRAFT_KEY,
            JSON.stringify({ for: email, ...draft, values }),
        );
    } catch {
        // Full or refused: setup works without a draft.
    }
}

export function clearSetupDraft(): void {
    try {
        storage()?.removeItem(SETUP_DRAFT_KEY);
    } catch {
        // Nothing to clear.
    }
}
