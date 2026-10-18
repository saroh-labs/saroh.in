import { formatPaise } from "./billing-words";
import { formatDate } from "./format";
import { endOfDayIso, rupeesToPaise } from "./overrides";

/**
 * A custom offer and Take away a module… (admin plan U5, R5), as the API
 * shapes them (`GET …/offers`, `POST …/overrides/preview`), and the words
 * the sheets say. Client-safe. It decides nothing: the API checks every
 * offer in its dry run and again in its write; this only turns what the
 * operator typed into a draft and the dry run's answer into sentences.
 */

export const OFFER_KINDS = [
    "plan",
    "price",
    "module",
    "limit",
    "trial",
] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];
export type PreviewKind = OfferKind | "remove";

export type AccessState = "on" | "locked" | "hidden";

export interface OfferKindOption {
    available: boolean;
    why: string | null;
}

export interface OfferOptions {
    organizationId: string;
    planName: string | null;
    kinds: Record<PreviewKind, OfferKindOption>;
    plans: { id: string; name: string }[];
    modules: {
        id: string;
        name: string;
        registry: string | null;
        state: AccessState;
        paidPlanIncludes: boolean;
    }[];
    limits: {
        key: string;
        label: string;
        limit: number | null;
        planLimit: number;
        per: string;
    }[];
    trialEndsAt: string | null;
    maxEndDays: number;
    raiseMaxDays: number;
    trialMaxDays: number;
}

export type OfferChange =
    | { type: "plan"; from: string; to: string }
    | { type: "price"; fromPaise: number; toPaise: number }
    | {
          type: "module";
          moduleId: string;
          name: string;
          from: AccessState;
          to: AccessState;
      }
    | {
          type: "limit";
          key: string;
          name: string;
          from: number | null;
          to: number | null;
          per: string;
      }
    | { type: "trial"; from: string | null; to: string };

export interface OfferPreview {
    kind: PreviewKind;
    endsAt: string | null;
    changes: OfferChange[];
    then: string | null;
    subject: string | null;
    days: number | null;
}

/** What the dry run takes: the offer as filled in so far. */
export interface OfferDraft {
    kind: PreviewKind;
    planKey?: string;
    pricePaise?: number;
    moduleKey?: string;
    value?: number;
    expiresAt?: string;
}

/** The sheet's fields, as typed. Dates are `YYYY-MM-DD`, money rupees. */
export interface OfferFields {
    planKey: string;
    rupees: string;
    moduleKey: string;
    limitKey: string;
    value: string;
    until: string;
}

export const EMPTY_FIELDS: OfferFields = {
    planKey: "",
    rupees: "",
    moduleKey: "",
    limitKey: "",
    value: "",
    until: "",
};

/** Each kind's card: what it gives, in a line. */
export const KIND_CARD: Record<OfferKind, { title: string; note: string }> = {
    plan: {
        title: "A plan until a date",
        note: "A better plan for a while; then back to their own.",
    },
    price: {
        title: "A custom price",
        note: "Their plan, at a price you set.",
    },
    module: {
        title: "One module",
        note: "A module their plan doesn't give them.",
    },
    limit: {
        title: "A higher limit",
        note: "More of something their plan counts, for a while.",
    },
    trial: {
        title: "A longer trial",
        note: "More days before their trial ends.",
    },
};

/**
 * The draft for the dry run, or why it can't be checked yet (a field still
 * empty or not a number). Null `error` with a null draft: nothing to say
 * yet, the operator hasn't started.
 */
export function draftFrom(
    kind: PreviewKind,
    f: OfferFields,
): { draft: OfferDraft | null; error: string | null } {
    const until = f.until ? endOfDayIso(f.until) : undefined;
    if (f.until && !until) return { draft: null, error: "Pick a real date." };
    switch (kind) {
        case "plan":
            if (!f.planKey || !until) return { draft: null, error: null };
            return {
                draft: { kind, planKey: f.planKey, expiresAt: until },
                error: null,
            };
        case "price": {
            if (!f.rupees.trim()) return { draft: null, error: null };
            const pricePaise = rupeesToPaise(f.rupees);
            if (pricePaise === null) {
                return {
                    draft: null,
                    error: "Write the price in rupees, like 1250 or 1250.50.",
                };
            }
            return {
                draft: { kind, pricePaise, expiresAt: until },
                error: null,
            };
        }
        case "module":
        case "remove":
            if (!f.moduleKey) return { draft: null, error: null };
            return {
                draft: { kind, moduleKey: f.moduleKey, expiresAt: until },
                error: null,
            };
        case "limit": {
            if (!f.limitKey || !f.value.trim() || !until) {
                return { draft: null, error: null };
            }
            const value = Number(f.value);
            if (!Number.isInteger(value) || value < 1) {
                return {
                    draft: null,
                    error: "The new limit is a whole number.",
                };
            }
            return {
                draft: { kind, moduleKey: f.limitKey, value, expiresAt: until },
                error: null,
            };
        }
        case "trial":
            if (!until) return { draft: null, error: null };
            return { draft: { kind, expiresAt: until }, error: null };
    }
}

const STATE_WORD: Record<AccessState, string> = {
    on: "on",
    locked: "locked",
    hidden: "hidden",
};

function cap(value: number | null, per: string): string {
    if (value === null) return "no limit";
    return `${value.toLocaleString("en-IN")}${per ? ` a ${per}` : ""}`;
}

/** One change in a sentence, as the business meets it. */
export function changeLine(change: OfferChange): string {
    switch (change.type) {
        case "plan":
            return `They are on ${change.to} instead of ${change.from}.`;
        case "price":
            return `They pay ${formatPaise(change.toPaise)} a month before GST instead of ${formatPaise(change.fromPaise)}.`;
        case "module":
            return change.to === "on"
                ? `${change.name} opens for them.`
                : `${change.name} goes from their workspace (${STATE_WORD[change.to]}). Nothing in it is deleted.`;
        case "limit":
            return `${change.name}: ${cap(change.to, change.per)} instead of ${cap(change.from, change.per)}.`;
        case "trial":
            return change.from
                ? `Their trial ends ${formatDate(change.to)} instead of ${formatDate(change.from)}.`
                : `Their trial ends ${formatDate(change.to)}.`;
    }
}

/** "What they'll see": each change, then when it ends and what follows. */
export function previewLines(preview: OfferPreview): string[] {
    const lines = preview.changes.map(changeLine);
    if (preview.kind === "plan") {
        lines.push("Their price doesn't change.");
    }
    if (preview.kind !== "trial") {
        lines.push(endLine(preview));
    }
    return lines;
}

function endLine(preview: OfferPreview): string {
    const end = preview.endsAt ? formatDate(preview.endsAt) : null;
    if (preview.kind === "plan") {
        return `On ${end ?? "the end date"} they go back to ${preview.then ?? "their own plan"}, unless you or they change it.`;
    }
    if (preview.kind === "remove") {
        return end
            ? `It comes back on ${end}, or when someone ends this.`
            : "It stays away until someone ends this.";
    }
    return end
        ? `Until ${end}, then it goes back to what their plan gives.`
        : "Until someone removes it.";
}

/** The confirm button: the action, named. */
export function confirmLabel(preview: OfferPreview): string {
    const until = preview.endsAt ? ` until ${formatDate(preview.endsAt)}` : "";
    const subject = preview.subject ?? "it";
    switch (preview.kind) {
        case "plan":
            return `Give ${subject}${until}`;
        case "price": {
            const price = preview.changes.find((c) => c.type === "price");
            return price?.type === "price"
                ? `Set their price to ${formatPaise(price.toPaise)}${until}`
                : `Set their price${until}`;
        }
        case "module":
            return `Give ${subject}${until}`;
        case "limit": {
            const limit = preview.changes.find((c) => c.type === "limit");
            return limit?.type === "limit" && limit.to !== null
                ? `Raise ${subject} to ${limit.to.toLocaleString("en-IN")}${until}`
                : `Raise ${subject}${until}`;
        }
        case "trial":
            return `Extend their trial to ${formatDate(preview.endsAt)}`;
        case "remove":
            return `Take away ${subject}${until}`;
    }
}

/** A sentence's full stop, once: "Rye & Co." stays as it is. */
function stop(text: string): string {
    return text.endsWith(".") ? text : `${text}.`;
}

/** The toast after it went through: past tense, naming the business. */
export function doneMessage(
    preview: OfferPreview,
    businessName: string,
): string {
    const until = preview.endsAt ? ` until ${formatDate(preview.endsAt)}` : "";
    const subject = preview.subject ?? "it";
    switch (preview.kind) {
        case "plan":
            return stop(`${businessName} is on ${subject}${until}`);
        case "price":
            return stop(`${businessName}'s custom price is set${until}`);
        case "module":
            return stop(`${subject} is on for ${businessName}${until}`);
        case "limit":
            return stop(`${subject} is raised for ${businessName}${until}`);
        case "trial":
            return stop(
                `${businessName}'s trial now ends ${formatDate(preview.endsAt)}`,
            );
        case "remove":
            return stop(
                `${subject} is taken away from ${businessName}${until}`,
            );
    }
}

/** The catalogue row to give for a registry module ("Give this module…"). */
export function rowForRegistry(
    options: OfferOptions,
    registry: string,
): string | null {
    return (
        options.modules.find((m) => m.registry === registry && m.state !== "on")
            ?.id ?? null
    );
}

/** Which kinds the sheet shows: a longer trial only while in one. */
export function shownKinds(options: OfferOptions): OfferKind[] {
    return OFFER_KINDS.filter(
        (kind) => kind !== "trial" || options.trialEndsAt !== null,
    );
}
