import { env } from "@/env";

/**
 * Whether the workspace shows Saroh's own plans (DEC-136): Settings › Plan
 * and billing, the plan, paused and plan-ending banners, limit notices,
 * plan locks and every "See plans".
 *
 * One switch, `NEXT_PUBLIC_PLANS`, and only "on" shows them: unset, "off"
 * or anything else hides them, so a deployment that leaves it out (as
 * production does until pricing opens) shows nothing of plans. It is
 * compiled into the build, so server and browser can't disagree, and
 * flipping it is a setting and a deploy, never a code change.
 *
 * It hides; it protects nothing. What a business may do is the API's to
 * decide (the catalogue it has published and `PLAN_ENFORCEMENT`), and this
 * switch changes neither. A business's own plans on sale (Payments ›
 * Subscriptions) are its product and are not behind it.
 *
 * Everything asks this function; nothing else reads the variable. Server
 * and client safe.
 *
 * Remove with: the variable in `env.ts`, the wrangler vars, CI and
 * `scripts/prepush.sh`, once pricing has been open long enough that
 * nobody would turn it back off. Read by the plan reads
 * (`service.ts`), `planRefusalOf`, `PlanWay` and its cards, the three
 * banners, the settings tab, the page's layout and its invoice route,
 * Activity, notifications, the module blocker's words, the rail's locks,
 * Home, onboarding, a setup step's way to a plan, the prompt to see plans
 * for the business's own email and the footer note in the site editor.
 */
export function plansShown(): boolean {
    return env.NEXT_PUBLIC_PLANS === "on";
}
