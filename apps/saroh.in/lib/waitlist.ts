import { z } from "zod";

import type { WaitlistKindId } from "@/content/waitlist";
import { WAITLIST_KINDS } from "@/content/waitlist";
import { EMAIL_SHAPE } from "@/lib/email-shape";
import { formatDay } from "@/lib/format/day";
import type { PlanId } from "@/lib/links";

/**
 * The waitlist form's rules and the shapes it trades with `/api/waitlist`
 * (plan U30). Shared by the form, the route and their tests.
 */

/** The design's messages, verbatim. City is optional and never refused. */
export const WAITLIST_MESSAGES = {
    business: "Add your business name.",
    kind: "Pick the closest one.",
    email: "Enter an email like name@shop.in.",
} as const;

/**
 * What a failed join tells the visitor, by the route's code (the waitlist
 * form and the changelog's sign-up both post to `/api/waitlist`); the form
 * keeps what they typed.
 */
export const SEND_FAILED: Record<string, string> = {
    RATE_LIMITED: "Too many tries from here. Wait a minute, then try again.",
    default: "We couldn't add you just now. Try again in a minute.",
};

const KIND_IDS = WAITLIST_KINDS.map((k) => k.id) as [
    WaitlistKindId,
    ...WaitlistKindId[],
];

export const waitlistSchema = z.object({
    business: z
        .string()
        .trim()
        .min(1, WAITLIST_MESSAGES.business)
        .max(120, WAITLIST_MESSAGES.business),
    kind: z.enum(KIND_IDS, { message: WAITLIST_MESSAGES.kind }),
    email: z
        .string()
        .trim()
        .max(320, WAITLIST_MESSAGES.email)
        .regex(EMAIL_SHAPE, WAITLIST_MESSAGES.email),
    city: z.string().trim().max(80),
});

export type WaitlistValues = z.input<typeof waitlistSchema>;

export const EMPTY_WAITLIST: WaitlistValues = {
    business: "",
    // An empty kind is "not picked yet"; the schema refuses it.
    kind: "" as WaitlistKindId,
    email: "",
    city: "",
};

const PLANS: readonly PlanId[] = ["free", "grow", "pro"];
const REF = /^[a-hj-km-np-z2-9]{8}$/;

/**
 * Where the visitor came from, from the page's query: `plan` only when it
 * names a plan, `src` cleaned to a short fixed-alphabet word ("direct" when
 * none) so it can go to GA, `ref` only when it looks like a referral id,
 * and `template` only when it is one of `templates` — the gallery's slugs
 * (`/templates/[slug]`'s "Save … for early access", plan U13).
 */
export function waitlistContext(
    params: {
        plan?: string | string[];
        src?: string | string[];
        ref?: string | string[];
        template?: string | string[];
    },
    templates: readonly string[] = [],
): { plan?: PlanId; src: string; ref?: string; template?: string } {
    const first = (v: string | string[] | undefined) =>
        Array.isArray(v) ? v[0] : v;
    const plan = first(params.plan)?.toLowerCase();
    const src = (first(params.src) ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 40);
    const ref = first(params.ref)?.trim().toLowerCase();
    const template = first(params.template)?.trim().toLowerCase();
    return {
        plan: PLANS.find((p) => p === plan),
        src: src || "direct",
        ref: ref && REF.test(ref) ? ref : undefined,
        template: templates.find((t) => t === template),
    };
}

/** What the page sends to `/api/waitlist`. */
export interface WaitlistRequest {
    business: string;
    kind: WaitlistKindId;
    email: string;
    city?: string;
    plan?: PlanId;
    src: string;
    ref?: string;
    /** The gallery template the visitor saved, by slug. */
    template?: string;
}

/** A gallery template the waitlist can save: its slug and name. */
export interface WaitlistTemplate {
    slug: string;
    name: string;
}

/** What `/api/waitlist` answers (the `{status}` contract). */
export type WaitlistResponse =
    | {
          status: "success";
          /** False when this email and business were already listed (D-8). */
          created: boolean;
          /** A new entry's place and referral id; never on a repeat. */
          position?: number;
          ref?: string;
          /**
           * The visitor joined from outside India, as the host saw their
           * connection. Saroh opens in India first, and the done card says so.
           */
          outsideIndia?: boolean;
      }
    | {
          status: "failure";
          reason?: {
              code?:
                  | "BAD_REQUEST"
                  | "INVALID"
                  | "RATE_LIMITED"
                  | "NOT_CONFIGURED"
                  | "UPSTREAM";
          };
      };

/** The header's date, as the design writes it: "Tue 5 Mar". */
export const openingShort = (isoDate: string) =>
    formatDay(isoDate, { weekday: "short", month: "short" });

/** The done state's date: "Tuesday 5 March". */
export const openingLong = (isoDate: string) =>
    formatDay(isoDate, { weekday: "long", month: "long" });

/** The note's date: "5 Mar". */
export const openingDay = (isoDate: string) =>
    formatDay(isoDate, { month: "short" });

/**
 * A referral link on this site: the full address to copy, and the design's
 * shorter one to show ("saroh.in/waitlist?ref=…", no scheme, no www).
 */
export function referralLink(
    origin: string,
    ref: string,
): { href: string; shown: string } {
    const url = new URL("/waitlist", origin);
    url.searchParams.set("ref", ref);
    const shown = `${url.host.replace(/^www\./, "")}${url.pathname}${url.search}`;
    return { href: url.toString(), shown };
}
