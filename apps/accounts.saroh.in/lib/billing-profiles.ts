import { phoneLabel, phoneNumberProblem } from "@saroh/ui/lib/phone";

import { GSTIN_SHAPE, stateName } from "./gst-states";

/**
 * Billing profiles in the account (DEC-167 step 2, #1015): what the API
 * answers (`GET /billing-profiles`, `GET /billing-profiles/:id`) and every
 * word the pages say about it, so a component only draws. Pure and
 * client-safe; the reads are `billing-profiles.server.ts`, the writes the
 * Server Actions in `app/account/(area)/billing-profiles/actions.ts`.
 */

export type SyncState = "linked" | "linking" | "failed" | "off";

export interface PendingMove {
    toProfileId: string;
    toLegalName: string;
    at: string | null;
    authorised: boolean;
}

export interface ProfileBusiness {
    id: string;
    name: string;
    /** The reader owns it, so may move it. */
    owner: boolean;
    plan: { name: string; cycle: string } | null;
    /** Charged through Razorpay: a move waits for the renewal. */
    paid: boolean;
    nextChargeAt: string | null;
    pendingMove: PendingMove | null;
}

export interface OwnedBusiness extends ProfileBusiness {
    billingProfileId: string | null;
}

export interface BillingProfile {
    id: string;
    legalName: string;
    gstin: string | null;
    gstState: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    billingEmail: string;
    phone: string | null;
    businesses: number;
    sync: SyncState;
    payingFor: ProfileBusiness[];
    movingIn: { organizationId: string; name: string; at: string | null }[];
}

export interface ProfileInvoice {
    id: string;
    number: string;
    organizationId: string;
    businessName: string;
    issuedAt: string;
    currency: string;
    totalPaise: number;
    pdfPath: string | null;
}

export interface ProfileDetail extends BillingProfile {
    invoices: ProfileInvoice[];
    invoiceCount: number;
    removeBlockedBy: string | null;
}

/** The fields of the Edit and Add panels, as typed. */
export interface ProfileValues {
    legalName: string;
    registered: "yes" | "no";
    gstin: string;
    addressLine1: string;
    city: string;
    gstState: string;
    postalCode: string;
    billingEmail: string;
    phone: string;
}

export type ProfileField = keyof ProfileValues;

// ── Words ──────────────────────────────────────────────────────────────

export const LIST_TITLE = "Billing profiles";
export const LIST_INTRO = "Who Saroh bills for each business you own.";
export const LIST_INTRO_MORE =
    "Open one to see it, change its details or move a business.";
export const LIST_FOOT =
    "A change reaches Saroh's next invoice, never one already sent. A paid business moves to another profile at its next renewal.";
export const NAV_NOTE =
    "These are yours, not any one business's. Teammates never see them.";
export const ADD_PROFILE = "+ Add billing profile";
export const NOTHING_YET = "Pays for nothing yet";

/** The pill beside a profile's name, if its state needs one. */
export function syncBadge(
    sync: SyncState,
    where: "list" | "page",
): { label: string; variant: "success" | "warning" | "error" } | null {
    if (sync === "linking") return { label: "Linking", variant: "warning" };
    if (sync === "failed") return { label: "Couldn't link", variant: "error" };
    if (sync === "linked" && where === "page") {
        return { label: "Linked at Razorpay", variant: "success" };
    }
    return null;
}

/** What a profile's sync says in its card (F7). */
export const SYNC_FAILED_SAYS =
    "Razorpay didn't accept this profile, so a payment can't name it yet. Check the billing email and phone, then try again.";
export const SYNC_LINKING_SAYS =
    "Being linked at Razorpay. This takes a minute or two. Nothing for you to do.";

export function gstLine(p: Pick<BillingProfile, "gstin">): string {
    return p.gstin ? `GSTIN ${p.gstin}` : "Not GST-registered";
}

/** A profile's first letter, for its square. */
export function initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || "?";
}

/** The chips under a profile on the list. */
export function chips(p: Pick<BillingProfile, "payingFor">): string[] {
    if (p.payingFor.length === 0) return [NOTHING_YET];
    return p.payingFor.map((b) =>
        b.pendingMove ? `${b.name} · moving` : b.name,
    );
}

/** The phone list's one line for what a profile pays for. */
export function paysForLine(p: Pick<BillingProfile, "payingFor">): string {
    if (p.payingFor.length === 0) return NOTHING_YET;
    return `Pays for ${p.payingFor
        .map((b) => (b.pendingMove ? `${b.name} (moving)` : b.name))
        .join(", ")}`;
}

/**
 * A stored number as a person reads it, grouped: "+91 98450 12345" (#1036,
 * the one rule in `@saroh/block-contract`).
 */
export { phoneLabel };

/** "pays for 2 businesses", under the page's title. */
export function paysForCount(n: number): string {
    if (n === 0) return "pays for nothing yet";
    return `pays for ${n} ${n === 1 ? "business" : "businesses"}`;
}

/** "Grow · monthly autopay", "Free", or no plan. */
export function planLine(b: Pick<ProfileBusiness, "plan" | "paid">): string {
    if (!b.plan) return "No plan yet";
    if (!b.paid) return b.plan.name;
    return `${b.plan.name} · ${b.plan.cycle === "year" ? "yearly" : "monthly"} autopay`;
}

/** The short plan name, for the phone and the move dialog. */
export function planName(b: Pick<ProfileBusiness, "plan">): string {
    return b.plan?.name ?? "No plan yet";
}

/** "21 Nov": a day in India, where Saroh bills. */
export function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
    });
}

/** The column beside a business: its next charge, or why there is none. */
export function nextLine(
    b: Pick<ProfileBusiness, "nextChargeAt" | "paid">,
): string {
    if (b.nextChargeAt) return `Next charge ${shortDate(b.nextChargeAt)}`;
    return b.paid ? "No charge due" : "Nothing to charge";
}

/** A pending move, in words. */
export function pendingLine(m: PendingMove): string {
    const on = m.at ? ` on ${shortDate(m.at)}` : "";
    return m.authorised
        ? `Moves to ${m.toLegalName}${on}.`
        : `Moves to ${m.toLegalName}${on}, once its payment is authorised.`;
}

/** Saroh's invoice total, in its currency. */
export function money(paise: number, currency: string): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
        minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    }).format(paise / 100);
}

/** "Plot 14, Sector 3, Rohtak, Haryana 124001", or null when there is none. */
export function addressLine(
    p: Pick<
        BillingProfile,
        "addressLine1" | "addressLine2" | "city" | "gstState" | "postalCode"
    >,
): string | null {
    const state = [stateName(p.gstState), p.postalCode]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(" ");
    const parts = [p.addressLine1, p.addressLine2, p.city, state]
        .map((s) => s?.trim())
        .filter((s): s is string => Boolean(s));
    return parts.length ? parts.join(", ") : null;
}

/** Why Remove is off, else null. The API says the same. */
export function removeReason(p: ProfileDetail): string | null {
    return p.removeBlockedBy;
}

/** "Pulse Fitness Rohtak and Pulse Fitness Gurugram", or "A, B and C". */
export function namesList(names: string[]): string {
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The Edit panel's note and its Save, naming what the change reaches. */
export function editSays(p: Pick<BillingProfile, "payingFor">): {
    note: string;
    save: string;
} {
    const names = p.payingFor.map((b) => b.name);
    const n = names.length;
    return {
        note:
            n === 0
                ? "No business uses it yet. Razorpay gets the change in the background."
                : `Saroh's next invoice for ${namesList(names)} uses these details. Invoices already sent keep theirs. Razorpay gets the change in the background.`,
        save: n > 1 ? `Save for ${n} businesses` : "Save",
    };
}

// ── Checks made before saving (the API makes them again) ───────────────

/** A GSTIN whose state code isn't the state chosen, in the design's words. */
export function gstinStateProblem(gstin: string, state: string): string | null {
    const g = gstin.trim().toUpperCase();
    if (!GSTIN_SHAPE.test(g) || !state) return null;
    const code = g.slice(0, 2);
    if (code === state) return null;
    return `This GSTIN starts with ${code} (${stateName(code) ?? "another state"}), but the state below is ${stateName(state) ?? "another state"} (${state}). Change one so they match.`;
}

/** Another of the owner's profiles already billed at this email. */
export function emailTakenBy(
    email: string,
    others: readonly Pick<
        BillingProfile,
        "id" | "legalName" | "billingEmail"
    >[],
): string | null {
    const e = email.trim().toLowerCase();
    const taken = others.find((o) => o.billingEmail.toLowerCase() === e);
    return taken
        ? `${taken.legalName} already uses this email. Use a different one, so Razorpay can tell the two apart.`
        : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is wrong with the fields, field by field, in their order. */
export function profileProblems(
    v: ProfileValues,
    others: readonly Pick<
        BillingProfile,
        "id" | "legalName" | "billingEmail"
    >[],
): [ProfileField, string][] {
    const out: [ProfileField, string][] = [];
    if (!v.legalName.trim()) {
        out.push(["legalName", "Add the legal name Saroh's invoices go to."]);
    }
    if (v.registered === "yes") {
        const g = v.gstin.trim().toUpperCase();
        if (!g) out.push(["gstin", "Add the GSTIN, or choose Not registered."]);
        else if (!GSTIN_SHAPE.test(g)) {
            out.push([
                "gstin",
                "A GSTIN is 15 characters, like 29ABCDE1234F1ZW.",
            ]);
        } else {
            const problem = gstinStateProblem(g, v.gstState);
            if (problem) out.push(["gstin", problem]);
        }
    }
    const pin = v.postalCode.replace(/\s+/g, "");
    if (pin && !/^\d{6}$/.test(pin)) {
        out.push(["postalCode", "A PIN code is six digits, like 560038."]);
    }
    const email = v.billingEmail.trim();
    if (!email) {
        out.push([
            "billingEmail",
            "Add an email for Saroh's invoices and payment receipts.",
        ]);
    } else if (!EMAIL.test(email)) {
        out.push(["billingEmail", "That email doesn't look right."]);
    } else {
        const taken = emailTakenBy(email, others);
        if (taken) out.push(["billingEmail", taken]);
    }
    const phone = phoneNumberProblem(v.phone);
    if (phone) out.push(["phone", phone]);
    return out;
}

/** A profile as the panel's fields hold it. */
export function valuesOf(p: BillingProfile | null): ProfileValues {
    return {
        legalName: p?.legalName ?? "",
        registered: p && !p.gstin ? "no" : "yes",
        gstin: p?.gstin ?? "",
        addressLine1: [p?.addressLine1, p?.addressLine2]
            .filter(Boolean)
            .join(", "),
        city: p?.city ?? "",
        gstState: p?.gstState ?? "",
        postalCode: p?.postalCode ?? "",
        billingEmail: p?.billingEmail ?? "",
        phone: p?.phone ?? "",
    };
}

/** Start an Add from another profile: its address and GST, never its email. */
export function startFrom(p: BillingProfile): ProfileValues {
    return { ...valuesOf(p), legalName: "", billingEmail: "", phone: "" };
}

/** What a save sends: everything for a new profile. */
export function profileInput(v: ProfileValues): Record<string, string> {
    return {
        legalName: v.legalName.trim(),
        gstin: v.registered === "yes" ? v.gstin.trim().toUpperCase() : "",
        gstState: v.gstState,
        addressLine1: v.addressLine1.trim(),
        city: v.city.trim(),
        postalCode: v.postalCode.replace(/\s+/g, ""),
        billingEmail: v.billingEmail.trim(),
        phone: v.phone.trim(),
    };
}

/** What an edit sends: only what changed. */
export function profileEdit(
    v: ProfileValues,
    before: BillingProfile,
): Record<string, string> {
    const now = profileInput(v);
    const was = profileInput(valuesOf(before));
    const out: Record<string, string> = {};
    for (const [k, value] of Object.entries(now)) {
        if (value !== was[k]) out[k] = value;
    }
    // One address line here: the second is folded into the first.
    if ("addressLine1" in out && before.addressLine2) {
        out.addressLine2 = "";
    }
    return out;
}

/** An API refusal's field, as a field of the panel. */
export function fieldOf(field: string | undefined): ProfileField | null {
    const known: ProfileField[] = [
        "legalName",
        "gstin",
        "addressLine1",
        "city",
        "gstState",
        "postalCode",
        "billingEmail",
        "phone",
    ];
    return known.includes(field as ProfileField)
        ? (field as ProfileField)
        : null;
}

// ── Moving a business ──────────────────────────────────────────────────

/** The line under a business in the Move dialog's title. */
export function moveBusinessLine(b: ProfileBusiness, billedTo: string): string {
    if (b.paid) {
        const next = b.nextChargeAt
            ? ` · next charge ${shortDate(b.nextChargeAt)}`
            : "";
        return `${planName(b)}${next} · billed to ${billedTo}`;
    }
    return `${planName(b)} · billed to ${billedTo}`;
}

/** A profile as a choice in the Move dialog: its line, and whether it can take it. */
export function moveTarget(
    p: BillingProfile,
    b: ProfileBusiness,
    currentId: string | null,
): { line: string; disabled: boolean } {
    if (p.id === currentId) return { line: "Bills it now", disabled: true };
    if (b.paid && p.sync !== "linked") {
        return {
            line:
                p.sync === "failed"
                    ? "Couldn't link at Razorpay yet · fix it before moving a paid business here"
                    : "Not linked at Razorpay yet · wait for it before moving a paid business here",
            disabled: true,
        };
    }
    return {
        line: `${gstLine(p)} · ${paysForCount(p.payingFor.length)}`,
        disabled: false,
    };
}

/** The Move dialog's note, its strong sentence first. */
export function moveNote(
    b: ProfileBusiness,
    billedTo: string,
    target: string,
): { strong: string; rest: string } {
    if (b.paid) {
        const on = b.nextChargeAt ? shortDate(b.nextChargeAt) : null;
        return {
            strong: on
                ? `It moves at its next renewal, on ${on}.`
                : "It moves at its next renewal.",
            rest: `Until then Saroh keeps billing ${billedTo}. ${on ? `Before ${on}, authorise` : "Authorise"} the plan on ${target}. It takes a minute, and nothing is charged twice or missed.`,
        };
    }
    return {
        strong: "It moves now.",
        rest: `${b.name} is on ${planName(b)}, so there's nothing to charge. When it moves to a paid plan, Saroh bills ${target}.`,
    };
}

export function moveConfirm(b: Pick<ProfileBusiness, "paid">): string {
    return b.paid ? "Move at next renewal" : "Move now";
}

/** "Bill a business to it now"'s option for one business. */
export function billNowOption(b: OwnedBusiness): {
    label: string;
    disabled: boolean;
    hint?: string;
} {
    if (b.paid) {
        const on = b.nextChargeAt ? `, ${shortDate(b.nextChargeAt)}` : "";
        return {
            label: `${b.name} · moves at its renewal${on}`,
            disabled: true,
            hint: "Move it from the new profile once Razorpay has linked it",
        };
    }
    return { label: `${b.name} · ${planName(b)}, moves now`, disabled: false };
}
