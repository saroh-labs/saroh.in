import { env } from "@/env";

/**
 * Whether a new website may be started from a chosen template (DEC-135):
 * only when `NEXT_PUBLIC_TEMPLATES` is `on`. Unset or anything else is off,
 * so a production build that leaves it out offers no choice. Unset counts
 * as on only under `next dev`, so local work sees the picker without a
 * setting; `off` there checks the hidden state.
 *
 * Off, `/sites/new` and the Website step of the Turn on sheet show no
 * template and send none, and the API starts the site from the one for
 * what is being set up (`kindDefaults(kind).starterTemplate`). A site
 * already made from a template is untouched. It hides the choice only: the
 * API still accepts a template.
 */
export function templatesOn(
    flag: string | undefined,
    nodeEnv: string | undefined,
): boolean {
    if (flag) return flag === "on";
    return nodeEnv === "development";
}

/** {@link templatesOn} for this build. Client-safe: both are public. */
export function templateChoiceOn(): boolean {
    return templatesOn(env.NEXT_PUBLIC_TEMPLATES, env.NODE_ENV);
}
