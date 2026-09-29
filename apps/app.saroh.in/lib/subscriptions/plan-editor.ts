import type {
    EditorCopy,
    EditorProblem,
    EditorRecord,
} from "@/lib/editor-shell/types";

import type { AutopayLimit, PlanEditorRecord, PlanValues } from "./plan-drafts";
import type { Interval, Plan } from "./service";
import { classesText, money } from "./view";

/*
 * The Plan Editor's rules (plan 2026-09-26-004, D7), after "Saroh Plan
 * Editor". Pure: the page draws what these say, and the editor shell (D6)
 * autosaves what `payloadOf` makes of the form.
 *
 * The form holds what is typed — a price is text until it is a price — and
 * the adapter turns it into D5's `PlanValues` on the way out and back.
 */

/** What the editor's fields hold. `classes` is "" for as many as they like. */
export interface PlanForm extends Record<string, unknown> {
    name: string;
    description: string;
    /** As typed: "1,200" and "1200.50" are prices; "" is none yet. */
    price: string;
    /** The plan's currency; "" on a new plan, which takes the business's. */
    currency: string;
    interval: Interval;
    /** "" is unlimited; otherwise whole classes a month, as typed. */
    classes: string;
}

export const EMPTY_PLAN: PlanForm = {
    name: "",
    description: "",
    price: "",
    currency: "",
    interval: "MONTH",
    classes: "",
};

/** The API's limit on classes a month (`PLAN_CLASSES_MAX`). */
export const CLASSES_MAX = 60;

/** The chips before "Other…": unlimited, then 4, 8 and 12 (the design's). */
export const CLASS_CHOICES = ["", "4", "8", "12"] as const;

/** Month and year first; week and quarter under "More" (default 29). */
export const MAIN_INTERVALS: Interval[] = ["MONTH", "YEAR"];
export const MORE_INTERVALS: Interval[] = ["WEEK", "QUARTER"];

export const INTERVAL_LABEL: Record<Interval, string> = {
    WEEK: "Every week",
    MONTH: "Every month",
    QUARTER: "Every quarter",
    YEAR: "Every year",
};

const EVERY: Record<Interval, string> = {
    WEEK: "week",
    MONTH: "month",
    QUARTER: "quarter",
    YEAR: "year",
};

/** A month's worth of one period's price (a year is a twelfth). */
const PER_MONTH: Record<Interval, number> = {
    WEEK: 52 / 12,
    MONTH: 1,
    QUARTER: 1 / 3,
    YEAR: 1 / 12,
};

/** Up to nine whole digits and two decimals, as the API takes a price. */
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

/** The typed price as the API takes it ("1200.50"), or null when it isn't one. */
export function parsePrice(typed: string): string | null {
    const bare = typed.replace(/[\s,₹]/g, "");
    return MONEY.test(bare) ? bare : null;
}

/** "1500.00" reads "1500"; "1500.50" stays. */
function priceText(price: string | null): string {
    if (!price) return "";
    return price.endsWith(".00") ? price.slice(0, -3) : price;
}

/** A typed class count, 1–60, or null when it isn't one. */
export function parseClasses(typed: string): number | null {
    if (!/^\d{1,3}$/.test(typed.trim())) return null;
    const n = Number(typed.trim());
    return n >= 1 && n <= CLASSES_MAX ? n : null;
}

export function formOf(values: PlanValues): PlanForm {
    return {
        name: values.name,
        description: values.description ?? "",
        price: priceText(values.price),
        currency: values.currency,
        interval: values.interval,
        classes: values.classesPerMonth ? String(values.classesPerMonth) : "",
    };
}

/**
 * What an autosave sends. Only called once `blockerOf` is null, so the
 * price and classes parse; a new plan leaves the currency to the API.
 */
export function payloadOf(form: PlanForm): Partial<PlanValues> {
    const price = form.price.trim() ? parsePrice(form.price) : null;
    return {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price,
        ...(form.currency ? { currency: form.currency } : {}),
        interval: form.interval,
        classesPerMonth: form.classes ? parseClasses(form.classes) : null,
    };
}

/** D5's answer as the shell reads it, with the form in place of values. */
export function editorRecordOf(
    record: PlanEditorRecord,
): EditorRecord<PlanForm> {
    return {
        id: record.id,
        status: record.status,
        hasPendingChanges: record.hasPendingChanges,
        revision: record.revision,
        values: formOf(record.values),
        published: record.published ? formOf(record.published) : null,
        canDelete: record.canDelete,
    };
}

/**
 * A name the server says another plan has, as of the values it judged.
 * It stands while the name on screen is still that one.
 */
export interface NameClash {
    name: string;
    message: string;
}

export function clashOf(record: PlanEditorRecord): NameClash | null {
    const p = record.problems.find(
        (x) => x.field === "name" && record.values.name.trim(),
    );
    return p ? { name: record.values.name.trim(), message: p.message } : null;
}

function same(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface ProblemContext {
    /** The business sells classes (Appointments on). */
    withClasses: boolean;
    /** "Other…" is chosen, so a count must be typed. */
    otherClasses: boolean;
    /** Other plans' names (not archived), for a clash seen before saving. */
    takenNames: readonly string[];
    clash: NameClash | null;
}

/** Every rule the form breaks; each stops Publish and marks its field. */
export function planProblems(
    form: PlanForm,
    ctx: ProblemContext,
): EditorProblem[] {
    const out: EditorProblem[] = [];
    const name = form.name.trim();
    if (!name) {
        out.push({ field: "name", message: "Give it a name" });
    } else {
        const taken = ctx.takenNames.find((n) => same(n, name));
        if (taken) {
            out.push({
                field: "name",
                message: `There's already a plan called ${taken.trim()}`,
            });
        } else if (ctx.clash && same(ctx.clash.name, name)) {
            out.push({ field: "name", message: ctx.clash.message });
        }
    }
    const price = form.price.trim() ? parsePrice(form.price) : null;
    if (!form.price.trim() || (price !== null && Number(price) === 0)) {
        out.push({ field: "price", message: "Add the price" });
    } else if (price === null) {
        out.push({
            field: "price",
            message: "A price is a number, with at most two decimals",
        });
    }
    if (ctx.withClasses && (ctx.otherClasses || form.classes)) {
        const n = form.classes.trim() ? Number(form.classes.trim()) : 0;
        if (Number.isFinite(n) && n > CLASSES_MAX) {
            out.push({
                field: "classes",
                message: `${CLASSES_MAX} a month is the most`,
            });
        } else if (parseClasses(form.classes) === null) {
            out.push({
                field: "classes",
                message: "How many classes a month?",
            });
        }
    }
    return out;
}

/**
 * Why the form can't be saved at all yet. A draft needs a name, and a
 * price or a class count the API would refuse is held back rather than
 * sent to fail.
 */
export function planBlocker(
    form: PlanForm,
    ctx: Pick<ProblemContext, "withClasses" | "otherClasses">,
): string | null {
    if (!form.name.trim()) return "Add a name to save the draft";
    if (form.price.trim() && parsePrice(form.price) === null) {
        return "Fix the price to save — a number, with at most two decimals";
    }
    if (
        ctx.withClasses &&
        (ctx.otherClasses || form.classes) &&
        parseClasses(form.classes) === null
    ) {
        return `Say how many classes a month, 1 to ${CLASSES_MAX}, to save`;
    }
    return null;
}

function priceOf(form: PlanForm): number {
    const p = parsePrice(form.price);
    return p ? Number(p) : 0;
}

/**
 * "When you publish: …", one per change, in the design's words. A price is
 * for new sign-ups; the people on it keep theirs.
 */
export function planChanges(
    published: PlanForm,
    form: PlanForm,
    withClasses: boolean,
): string[] {
    const cur = form.currency || published.currency;
    const out: string[] = [];
    const before = priceOf(published);
    const after = priceOf(form);
    if (after !== before && after > 0) {
        out.push(
            `price ${money(before, cur)} → ${money(after, cur)} for new sign-ups`,
        );
    }
    if (form.interval !== published.interval) {
        out.push(
            `charged every ${EVERY[form.interval]} instead of every ${EVERY[published.interval]}`,
        );
    }
    if (withClasses) {
        const was = parseClasses(published.classes);
        const now = parseClasses(form.classes);
        if (was !== now && (!form.classes || now !== null)) {
            out.push(
                `${classesText(was).toLowerCase()} → ${classesText(now).toLowerCase()}`,
            );
        }
    }
    if (form.name.trim() && form.name.trim() !== published.name.trim()) {
        out.push(`renamed to ${form.name.trim()}`);
    }
    if (form.description.trim() !== published.description.trim()) {
        out.push("new description");
    }
    return out;
}

/**
 * Said after the changes: what the people already on it keep. A price is
 * theirs until they change plan; classes change at their next renewal (D10).
 */
export function changesNote(
    published: PlanForm,
    form: PlanForm,
    subscribers: number,
): string {
    if (!subscribers) return "";
    const classes =
        parseClasses(published.classes) !== parseClasses(form.classes) &&
        (!form.classes || parseClasses(form.classes) !== null);
    const who = `The ${subscribers} already on it`;
    return classes
        ? `${who} keep what they pay — nobody's price changes under them. Their classes change from their next renewal.`
        : `${who} keep what they agreed to — nobody's price changes under them.`;
}

/**
 * How the plan is paid, under the intervals. It never promises autopay the
 * business can't take (DEC-038): `autopay` is the business's autopay offer
 * (D14's `GET /subscriptions/autopay`), true only once its provider takes
 * mandates and autopay is on; unknown reads as false.
 */
export function everyNote(form: PlanForm, autopay = false): string {
    const price = priceOf(form);
    if (!price) return "";
    const how = autopay
        ? "with a pay link, or by autopay for members who set it up"
        : "with a pay link";
    const invoiced = `Invoiced each ${EVERY[form.interval]} ${how}.`;
    if (form.interval === "MONTH" || form.interval === "WEEK") return invoiced;
    const cur = form.currency || "INR";
    return `Works out to ${money(Math.round(price * PER_MONTH[form.interval]), cur)} a month. ${invoiced}`;
}

/**
 * D13's warning under the price: the members booked to switch to this plan
 * whose autopay covers less than the price typed. Their renewal onto it is
 * never charged above what they authorised (MANDATE_LIMIT_LOW), so they
 * will need to authorise again. ₹X is the highest of their limits: none of
 * them covers more. "" when nobody's autopay falls short.
 */
export function autopayLimitWarning(
    form: PlanForm,
    limits: readonly AutopayLimit[] | undefined,
    currency: string,
): string {
    const price = parsePrice(form.price);
    if (!price || !limits?.length) return "";
    const priceMinor = toMinorUnits(price);
    const short = limits.filter((l) => toMinorUnits(l.limit) < priceMinor);
    const members = short.reduce((n, l) => n + l.members, 0);
    if (!members) return "";
    const cap = short.reduce(
        (hi, l) => (toMinorUnits(l.limit) > toMinorUnits(hi) ? l.limit : hi),
        short[0].limit,
    );
    const who = members === 1 ? "1 member" : `${members} members`;
    return `Autopay covers up to ${money(cap, currency || "INR")}; ${who} will need to authorise again`;
}

/** "1500.5" as 150050: compared in whole paise, never as floats. */
function toMinorUnits(amount: string): number {
    const [whole, frac = ""] = amount.split(".");
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** The figures the side panel reads: absent for a plan not saved yet. */
export type PlanFigures = Pick<
    Plan,
    "subscriberCount" | "monthlyFromMembers" | "byPrice" | "currency"
>;

/** At a glance, in the design's order. */
export function glance(
    form: PlanForm,
    figures: PlanFigures | null,
): { label: string; value: string }[] {
    const price = priceOf(form);
    const cur = form.currency || (figures?.currency ?? "INR");
    const coming = figures ? Math.round(Number(figures.monthlyFromMembers)) : 0;
    return [
        {
            label: "Per month",
            value: price
                ? money(Math.round(price * PER_MONTH[form.interval]), cur)
                : "—",
        },
        { label: "On it now", value: String(figures?.subscriberCount ?? 0) },
        {
            label: "Coming in a month",
            value: coming > 0 ? money(coming, figures?.currency ?? cur) : "—",
        },
    ];
}

/** Who pays what: "12 people" at today's price, "3 people · older price". */
export function whoPays(
    figures: PlanFigures | null,
): { label: string; value: string }[] {
    return (figures?.byPrice ?? []).map((b) => ({
        label: `${b.count} ${b.count === 1 ? "person" : "people"}${b.current ? "" : " · older price"}`,
        value: money(b.price, b.currency),
    }));
}

/** The header's title: the name typed so far. */
export function planTitle(form: PlanForm, saved: boolean): string {
    return form.name.trim() || (saved ? "Untitled plan" : "New plan");
}

/** The toast after Publish. */
export function publishedText(
    name: string,
    wasLive: boolean,
    subscribers: number,
): string {
    if (!wasLive) return `${name} is open for sign-ups.`;
    return subscribers
        ? `Changes published. The ${subscribers} already on it keep what they pay now.`
        : "Changes published.";
}

export const PLAN_COPY: EditorCopy = {
    noun: "plan",
    liveLabel: "Open",
    liveClean: "Open to new sign-ups · no changes",
    draftSaved: "Draft · saved — nobody can join it yet",
    draftFirstSaved:
        "Saved as a draft — nobody can join it yet. Delete draft if you change your mind.",
    notStarted: "Not saved yet — start with a name",
    viewLabel: "View plan",
};

/** A field's name in the leave dialog ("Your changes to price aren't saved"). */
export const PLAN_FIELD_LABELS: Partial<
    Record<keyof PlanForm & string, string>
> = {
    name: "name",
    description: "what's included",
    price: "price",
    interval: "billing",
    classes: "classes",
};

export const editHref = (id: string) =>
    `/billing/plans/${encodeURIComponent(id)}/edit`;
export const viewHref = (id: string) =>
    `/billing/plans/${encodeURIComponent(id)}`;
