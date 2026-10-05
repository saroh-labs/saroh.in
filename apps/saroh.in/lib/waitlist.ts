import { z } from "zod";

import type { WaitlistKindId } from "@/content/waitlist";
import { WAITLIST_KINDS } from "@/content/waitlist";
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

const KIND_IDS = WAITLIST_KINDS.map((k) => k.id) as [
    WaitlistKindId,
    ...WaitlistKindId[],
];

/** The design's own email check, so the page refuses what the design does. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        .regex(EMAIL, WAITLIST_MESSAGES.email),
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
 * none) so it can go to GA, and `ref` only when it looks like a referral id.
 */
export function waitlistContext(params: {
    plan?: string | string[];
    src?: string | string[];
    ref?: string | string[];
}): { plan?: PlanId; src: string; ref?: string } {
    const first = (v: string | string[] | undefined) =>
        Array.isArray(v) ? v[0] : v;
    const plan = first(params.plan)?.toLowerCase();
    const src = (first(params.src) ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 40);
    const ref = first(params.ref)?.trim().toLowerCase();
    return {
        plan: PLANS.find((p) => p === plan),
        src: src || "direct",
        ref: ref && REF.test(ref) ? ref : undefined,
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
export function openingShort(isoDate: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
    })
        .format(dayOf(isoDate))
        .replace(",", "");
}

/** The done state's date: "Tuesday 5 March". */
export function openingLong(isoDate: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Asia/Kolkata",
    })
        .format(dayOf(isoDate))
        .replace(",", "");
}

/** The note's date: "5 Mar". */
export function openingDay(isoDate: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
    }).format(dayOf(isoDate));
}

/** Noon in India on that day, so no time zone moves it to another date. */
function dayOf(isoDate: string): Date {
    return new Date(`${isoDate}T12:00:00+05:30`);
}

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
