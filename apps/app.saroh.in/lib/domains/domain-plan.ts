import { formatDate } from "@/lib/format/datetime";
import type { DomainScene, DomainView } from "./domain-view";
import type { DomainPlanRead } from "./service";

/**
 * What the business's plan means for its own domain, as the domain's card
 * says it (DEC-139).
 *
 * A domain belongs to a paid plan. When the plan stops including one the
 * domain is paused, never removed: the business is told before the plan
 * ends, the domain shows the site for 3 days after, then it sends visitors
 * to the business's Saroh address. The connection is kept, so a plan with
 * a domain again shows the site at once.
 *
 * The api decides all of it (`plan` on each domain, `billing/domain-plan.ts`
 * there). This only words its answer:
 *
 * | api `plan.state` | on a domain that serves                                   | on one that doesn't serve yet                  |
 * | ---------------- | --------------------------------------------------------- | ---------------------------------------------- |
 * | `included`       | nothing                                                   | nothing                                        |
 * | `ending`         | "Stops showing your site on 15 Nov…"                      | nothing: it isn't showing one                  |
 * | `grace`          | "Stops showing your site on 15 Nov…"                      | "…won't show your site until…"                 |
 * | `paused`         | "Paused: visitors are sent to yourshop.saroh.app…", and the card's tag says Paused, not Live | "…won't show your site until…" |
 *
 * No plan, price or limit is named here: which plan includes a domain is
 * the catalogue's to say, on Plan and billing. The caller draws the note
 * with the way there (`PausedNote`), and passes no plan at all while plans
 * aren't shown (DEC-136), so nothing here is drawn then.
 *
 * Pure, and apart from `service.ts` (which reads the session), so the
 * client component and a server component can both import it.
 */

/** The scenes in which the domain is what visitors reach. */
const SERVING: ReadonlySet<DomainScene> = new Set<DomainScene>([
    "live",
    "verified-off",
]);

/** The tag on a paused domain's card, in place of Live. */
export const PAUSED_BADGE = { label: "Paused", variant: "warning" } as const;

/** Where a paused domain sends its visitors, in words. */
function sentTo(plan: DomainPlanRead): string {
    return plan.sendsTo ?? "your Saroh web address";
}

/** How the domain comes back, the same in every note. */
const COMES_BACK =
    "It stays connected, and shows your site again as soon as you're on a plan with your own domain.";

/** For a domain that isn't serving, on a plan without one. */
const NOT_IN_PLAN =
    "Your plan doesn't include your own domain, so this one won't show your site until you're on a plan with one. You can still finish connecting it.";

/**
 * The note on a domain's card for where it stands against the plan, or
 * null when there is nothing to say: the plan includes it, the api didn't
 * say, or the state is one this screen doesn't know.
 */
export function domainPlanNote(
    scene: DomainScene,
    plan: DomainPlanRead | undefined,
    zone: string,
): string | null {
    if (!plan) return null;
    const serving = SERVING.has(scene);
    const day = plan.stopsAt ? formatDate(plan.stopsAt, zone) : null;
    switch (plan.state) {
        case "ending":
            // A domain that shows no site yet has nothing to stop.
            if (!serving || !day) return null;
            return `Stops showing your site on ${day}, 3 days after your plan ends. After that, visitors are sent to ${sentTo(plan)}. ${COMES_BACK}`;
        case "grace":
            if (!serving) return NOT_IN_PLAN;
            return day
                ? `Stops showing your site on ${day}: your plan no longer includes your own domain. After that, visitors are sent to ${sentTo(plan)}. ${COMES_BACK}`
                : NOT_IN_PLAN;
        case "paused":
            if (!serving) return NOT_IN_PLAN;
            return `Paused: visitors are sent to ${sentTo(plan)}. Your plan doesn't include your own domain. ${COMES_BACK}`;
        default:
            return null;
    }
}

/**
 * The card as the plan changes it: a paused domain that would read Live
 * says Paused instead, offers no "Live at" link, and says what removing it
 * really does now. Every other state leaves the card as it was.
 */
export function withDomainPlan(
    view: DomainView,
    hostname: string,
    plan: DomainPlanRead | undefined,
): DomainView {
    if (plan?.state !== "paused" || !SERVING.has(view.scene)) return view;
    return {
        ...view,
        badge: PAUSED_BADGE,
        liveUrl: null,
        removeWarning: `${hostname} is paused, so removing it changes nothing for visitors today. It disconnects the domain: to use it again you would add it and its DNS records from the start. Your web address on Saroh keeps working.`,
    };
}
