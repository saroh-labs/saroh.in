import {
    SETUP_PLAN,
    SETUP_PLAN_ACCOUNT_STEPS,
    stepLine,
} from "@saroh/ui/lib/setup-plan";
import { z } from "zod";

import type { OrganizationKind } from "./kind";
import { kindOf, ORGANIZATION_KINDS } from "./kind";

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
 * Pure and client-safe.
 */

/** What a person answers at setup. One form holds it for every step. */
export function setupSchema(needsName: boolean) {
    return z.object({
        // "A business" to start with (owner, 10 Oct): the answer is one
        // press to change.
        kind: z.enum(ORGANIZATION_KINDS),
        // Asked only of an account that has no name yet: one made with an
        // emailed code, which asks for nothing but the address.
        yourName: needsName
            ? z.string().trim().min(1, { message: "Enter your name" }).max(120)
            : z.string().optional(),
        name: z.string().trim().min(1, { message: "It needs a name" }),
        address: z.string().min(3, {
            message: "A web address needs at least 3 characters",
        }),
        country: z.string().length(2),
        // A goal's key, or "LATER".
        goal: z.string().min(1),
    });
}

export type SetupValues = z.infer<ReturnType<typeof setupSchema>>;
export type SetupField = keyof SetupValues;

export const SETUP_STEP_IDS = ["kind", "name", "first"] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

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
    first: ["goal"],
};

/** Setup's steps, in order: the plan's, after the account's. */
export const SETUP_STEPS: readonly SetupStep[] = SETUP_STEP_IDS.map(
    (id, index) => ({
        id,
        plan: SETUP_PLAN[SETUP_PLAN_ACCOUNT_STEPS + index] ?? "",
        fields: FIELDS[id],
    }),
);

const FIRST_STEP: SetupStepId = "kind";
const LAST_STEP: SetupStepId = "first";

export function stepIndex(step: SetupStepId): number {
    return SETUP_STEP_IDS.indexOf(step);
}

export function isLastStep(step: SetupStepId): boolean {
    return step === LAST_STEP;
}

/** The step before this one, or null on the first. */
export function stepBefore(step: SetupStepId): SetupStepId | null {
    return SETUP_STEP_IDS[stepIndex(step) - 1] ?? null;
}

/** The step after this one, or null on the last. */
export function stepAfter(step: SetupStepId): SetupStepId | null {
    return SETUP_STEP_IDS[stepIndex(step) + 1] ?? null;
}

/** The step that asks for a field: where its problem is shown. */
export function stepOfField(field: string): SetupStepId | null {
    return (
        SETUP_STEPS.find((s) => (s.fields as readonly string[]).includes(field))
            ?.id ?? null
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
): SetupStepId | null {
    const result = setupSchema(needsName).safeParse(values);
    if (result.success) return null;
    const wrong = new Set(result.error.issues.map((i) => String(i.path[0])));
    return (
        SETUP_STEPS.find((s) => s.fields.some((f) => wrong.has(f)))?.id ?? null
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
): SetupStepId {
    const stuck = firstUnanswered(values, needsName);
    return stuck && stepIndex(stuck) < stepIndex(asked) ? stuck : asked;
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
): { now: number; of: number } {
    const before = another ? 0 : SETUP_PLAN_ACCOUNT_STEPS;
    return {
        now: before + stepIndex(step) + 1,
        of: before + SETUP_STEPS.length,
    };
}

/** "Step 2 of 4". */
export function stepCount(step: SetupStepId, another: boolean): string {
    const { now, of } = stepPosition(step, another);
    return stepLine(now, of);
}

/** The line above the heading. Another business says so on a phone too. */
export function stepEyebrow(step: SetupStepId, another: boolean): string {
    const count = stepCount(step, another);
    return another ? `Set up another · ${count}` : count;
}

/** The plan beside the form: every step's name, and the one they are on. */
export function planFor(step: SetupStepId): {
    steps: string[];
    current: number;
} {
    return {
        steps: [...SETUP_PLAN],
        current: SETUP_PLAN_ACCOUNT_STEPS + stepIndex(step) + 1,
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
    try {
        storage()?.setItem(
            SETUP_DRAFT_KEY,
            JSON.stringify({ for: email, ...draft }),
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
