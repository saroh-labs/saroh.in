import { env } from "@/env";

/**
 * Whether Ask AI's screens are shown (DEC-220): the Ask AI button and
 * panel and Settings' Ask AI tab. Only when `NEXT_PUBLIC_ASK_AI` is `on`;
 * unset or anything else is off, so a production build that leaves it out
 * shows none of it. Unset counts as on only under `next dev`; `off` there
 * checks the hidden state. It hides; the API's `ASK_AI` flag decides
 * whether a business may ask. Readers: the shell's button and panel, the
 * nav item, Settings' Ask AI tab, Plan and billing's usage row, and the
 * panel's `/api/ask-ai` routes. Removed with them once Ask AI has been on
 * in production for a release.
 */
export function askAiOnFor(
    flag: string | undefined,
    nodeEnv: string | undefined,
): boolean {
    if (flag) return flag === "on";
    return nodeEnv === "development";
}

/** {@link askAiOnFor} for this build. Client-safe: both are public. */
export function askAiOn(): boolean {
    return askAiOnFor(env.NEXT_PUBLIC_ASK_AI, env.NODE_ENV);
}
