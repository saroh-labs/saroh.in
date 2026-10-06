import type { ModuleAccess } from "./access";
import { formatCount } from "./price";

/** A notice shows from this share of the limit. */
export const LIMIT_WARN_AT = 0.8;

export type LimitNotice =
    | { on: false; full: false; left?: number }
    | {
          on: true;
          full: boolean;
          left: number;
          /** Share used, capped at 100, e.g. "85%". */
          pct: string;
          title: string;
          body: string;
          cta: string;
          /** The reason a blocked action gives; empty while only warning, and always for a soft cap. */
          why: string;
          /** A soft cap: the notice informs, it never says anything stops. */
          soft: boolean;
      };

/**
 * The limit notice every screen shares: nothing under 80%, a warning from
 * 80%, blocked at 100%. `what` names the counted thing ("products");
 * `pausedText` says what stops at the limit. Wording follows the design.
 *
 * A soft cap (`access.soft`) never refuses, so its notice never says
 * anything stops: from 80% it says nothing will, and at 100% `pausedText`
 * (the soft rows' words begin "Nothing is blocked") with no `why`.
 */
export function limitNotice(
    access: Pick<ModuleAccess, "inc" | "limit" | "plan" | "upgradeTo"> &
        Partial<Pick<ModuleAccess, "soft">>,
    count: number,
    what: string,
    pausedText: string,
): LimitNotice {
    if (!access.inc || access.limit === null) return { on: false, full: false };
    const L = access.limit;
    const n = Number.isFinite(count) ? Math.max(0, count) : 0;
    if (n < LIMIT_WARN_AT * L) return { on: false, full: false, left: L - n };
    const full = n >= L;
    const up = access.upgradeTo;
    const soft = access.soft === true;
    // Storage counts in GB, so a count can have a fraction: one place.
    const used = formatCount(Math.round(n * 10) / 10);
    return {
        on: true,
        full,
        left: Math.max(0, L - n),
        pct: `${Math.min(100, Math.round((n / L) * 100))}%`,
        title: full
            ? `You've reached your ${formatCount(L)} ${what} on ${access.plan}`
            : `You've used ${used} of ${formatCount(L)} ${what} on ${access.plan}`,
        body: full
            ? pausedText +
              (up
                  ? ` ${up} raises the limit, or add more with an add-on.`
                  : " Add more with an add-on.")
            : (soft
                  ? `Nothing stops at ${formatCount(L)}; we'll let you know when you reach it.`
                  : `You'll be stopped at ${formatCount(L)}.`) +
              (up ? ` ${up} gives you more.` : " An add-on gives you more."),
        cta: up ? "Upgrade or add more" : "Add more",
        why:
            full && !soft
                ? `You've reached your ${what} limit on ${access.plan}`
                : "",
        soft,
    };
}
