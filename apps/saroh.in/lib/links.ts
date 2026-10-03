import { env } from "@/env";

const ACCOUNTS = env.NEXT_PUBLIC_ACCOUNTS_URL ?? "https://accounts.saroh.in";

/** Sign in, for someone who already has a business on Saroh. */
export const SIGN_IN_URL = `${ACCOUNTS}/login`;

/** Sign-up, used only in open mode (`cta`). */
export const SIGN_UP_URL = `${ACCOUNTS}/signup`;

export type LaunchMode = "waitlist" | "open";
export type PlanId = "free" | "grow" | "pro";

/** The site's launch mode. Anything but an explicit `open` is waitlist. */
export const LAUNCH_MODE: LaunchMode =
    env.NEXT_PUBLIC_LAUNCH_MODE === "open" ? "open" : "waitlist";

const PLAN_NAME: Record<PlanId, string> = {
    free: "Free",
    grow: "Grow",
    pro: "Pro",
};

export interface CtaInput {
    /** Where on the site the click came from, e.g. `nav`, `home-hero`. */
    src: string;
    /**
     * The plan the button names, when it names one: a site plan id, or any
     * id the pricing catalogue offers (the pricing page draws whatever plans
     * the catalogue has).
     */
    plan?: string;
    /** The plan's name, from the catalogue; defaults to the site's own name. */
    planName?: string;
    /** Whether the plan costs anything; defaults to "it isn't Free". */
    paid?: boolean;
    /** Open mode: the trial length a plan card offers, when a trial is on. */
    trialDays?: number;
    /** Defaults to the site's mode; tests and previews pass one. */
    mode?: LaunchMode;
}

export interface Cta {
    label: string;
    /** The same ask in fewer words, for the phone nav ("Join waitlist"). */
    shortLabel: string;
    href: string;
    mode: LaunchMode;
    plan?: string;
}

/**
 * The one builder for every "start" call to action (plan KTD-16, deviation
 * D-7). It returns BOTH the label and the address, so no page hard-codes
 * either and flipping `NEXT_PUBLIC_LAUNCH_MODE` changes them all:
 *
 * - waitlist: "Join the waitlist" (or "Get early access · Grow" when a paid
 *   plan is named), to `/waitlist?plan=…&src=…`.
 * - open: the design's "Start free", "Choose Grow" or "Start N-day trial", to
 *   sign-up with `?plan=…`.
 */
export function cta({
    src,
    plan,
    planName,
    paid: paidIn,
    trialDays,
    mode = LAUNCH_MODE,
}: CtaInput): Cta {
    const paid = plan !== undefined && (paidIn ?? plan !== "free");
    const name =
        plan === undefined
            ? ""
            : (planName ??
              (PLAN_NAME as Record<string, string | undefined>)[plan] ??
              plan);
    if (mode === "waitlist") {
        const q = new URLSearchParams();
        if (plan) q.set("plan", plan);
        q.set("src", src);
        return {
            mode,
            plan,
            label: paid ? `Get early access · ${name}` : "Join the waitlist",
            shortLabel: paid ? "Early access" : "Join waitlist",
            href: `/waitlist?${q.toString()}`,
        };
    }
    const q = new URLSearchParams();
    if (plan) q.set("plan", plan);
    q.set("src", src);
    let label = "Start free";
    if (paid) {
        label =
            trialDays && trialDays > 0
                ? `Start ${trialDays}-day trial`
                : `Choose ${name}`;
    }
    return {
        mode,
        plan,
        label,
        shortLabel: label,
        href: `${SIGN_UP_URL}?${q.toString()}`,
    };
}
