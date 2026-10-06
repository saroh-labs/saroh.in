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
    /**
     * Open mode: the billing cycle a paid plan's card shows (Pricing's
     * Monthly / Yearly switch). Carried to sign-up as `cycle`; it only
     * preselects, and the checkout prices it on the server (U15).
     */
    cycle?: "month" | "year";
    /** Defaults to the site's mode; tests and previews pass one. */
    mode?: LaunchMode;
    /**
     * A gallery template the button saves (`/templates/[slug]`, plan U13):
     * the waitlist remembers it (`?template=`); open mode carries it to
     * sign-up for onboarding to read once it does.
     */
    template?: { slug: string; name: string };
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
 *   plan is named, or "Save Gym for early access" when a gallery template
 *   is), to `/waitlist?plan=…&template=…&src=…`.
 * - open: the design's "Start free", "Choose Grow" or "Start N-day trial", to
 *   sign-up with `?plan=…&cycle=…` (a paid plan only) `&src=…`. Accounts
 *   carries the plan through sign-up and onboarding to the checkout (U27).
 */
export function cta({
    src,
    plan,
    planName,
    paid: paidIn,
    trialDays,
    cycle,
    mode = LAUNCH_MODE,
    template,
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
        if (template) q.set("template", template.slug);
        q.set("src", src);
        if (template && !paid) {
            return {
                mode,
                plan,
                label: `Save ${template.name} for early access`,
                shortLabel: "Save template",
                href: `/waitlist?${q.toString()}`,
            };
        }
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
    if (paid) q.set("cycle", cycle ?? "month");
    if (template) q.set("template", template.slug);
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
