import { env } from "@/env";

/**
 * Whether Settings › API and AI apps is shown (plan 2026-11-10-001): only
 * when `NEXT_PUBLIC_API_AREA` is `on`. Unset or anything else is off, so a
 * production build that leaves it out shows no tab, no search hit and no
 * page until the area is ready (#1357). Unset counts as on only under
 * `next dev`, so local work sees it; `off` there checks the hidden state.
 */
export function apiAreaOnFor(
    flag: string | undefined,
    nodeEnv: string | undefined,
): boolean {
    if (flag) return flag === "on";
    return nodeEnv === "development";
}

/** {@link apiAreaOnFor} for this build. Client-safe: both are public. */
export function apiAreaOn(): boolean {
    return apiAreaOnFor(env.NEXT_PUBLIC_API_AREA, env.NODE_ENV);
}
