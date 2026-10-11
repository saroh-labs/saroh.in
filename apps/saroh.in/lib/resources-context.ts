import type { PublishContext } from "@/content/resources";
import { env } from "@/env";

/**
 * Whether unpublished Resources pages are shown (plan KTD-2): only when
 * `RESOURCES_PREVIEW` is `1` or `true`, and never on a production
 * deployment, whatever the flag says. Local and preview builds may use it.
 */
export function previewOn(
    flag: string | undefined,
    vercelEnv: string | undefined,
): boolean {
    if (vercelEnv === "production") return false;
    return flag === "1" || flag?.toLowerCase() === "true";
}

/**
 * Whether the Templates gallery may be shown at all (DEC-135): only when
 * `NEXT_PUBLIC_TEMPLATES` is `on`. Unset or anything else is off, so a
 * production build that leaves it out shows no templates. Unset counts as
 * on only under `next dev`, so local work sees the gallery without a
 * setting; `off` there checks the hidden state.
 */
export function templatesOn(
    flag: string | undefined,
    nodeEnv: string | undefined,
): boolean {
    if (flag) return flag === "on";
    return nodeEnv === "development";
}

/** The build's routes from `SAROH_BUILT_ROUTES`, or null when it isn't set or readable. */
export function parseBuiltRoutes(raw: string | undefined): string[] | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) &&
            parsed.every((r): r is string => typeof r === "string")
            ? parsed
            : null;
    } catch {
        return null;
    }
}

/**
 * What every server render decides publishing with: the time now, the
 * preview flag, the build's routes and the pages switched off. Server only (it reads server env);
 * client components get the shown pages as props.
 */
export function resourcesContext(now: Date = new Date()): PublishContext {
    return {
        now,
        preview: previewOn(env.RESOURCES_PREVIEW, env.VERCEL_ENV),
        routes: parseBuiltRoutes(env.SAROH_BUILT_ROUTES),
        off: templatesOn(env.NEXT_PUBLIC_TEMPLATES, env.NODE_ENV)
            ? []
            : ["templates"],
    };
}
