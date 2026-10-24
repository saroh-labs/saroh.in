import { useEffect } from "react";

import { recordUpgradePrompt } from "./upgrade-prompts-action";

/**
 * The upgrade prompts the API counts (#1197, DEC-187): the same fixed list
 * as `api.saroh.in/src/modules/billing/upgrade-prompts.ts`. The API says
 * which plan each offers and sends "shown" once a business a day; here we
 * only say it happened. Nothing here ever shows the owner a failure.
 */
export const PROMPT_KEYS = [
    "deposits",
    "online_payments",
    "team_member",
    "own_domain",
    "memberships",
    "near_limit",
    "at_limit",
    "plan_refusal",
] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];
export type PromptAction = "shown" | "pressed";

const STORE = "saroh:upgrade-prompt-shown:";

/** Today as it reads in India: the day the API dedupes "shown" by. */
function istToday(now = Date.now()): string {
    return new Date(now + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function send(key: PromptKey, action: PromptAction): void {
    try {
        void recordUpgradePrompt(key, action).catch(() => undefined);
    } catch {
        // Counting is never the owner's problem.
    }
}

/**
 * The prompt was drawn. sessionStorage only saves repeat requests from this
 * tab today; the API is what sends it once.
 * shortcut: the tab's mark isn't per business, so switching business in one
 * tab on one day skips the second's request; key it by business if that
 * ever matters.
 */
export function promptShown(key: PromptKey): void {
    const mark = STORE + key;
    const today = istToday();
    try {
        if (window.sessionStorage.getItem(mark) === today) return;
        window.sessionStorage.setItem(mark, today);
    } catch {
        // No storage (a private window): the API still dedupes.
    }
    send(key, "shown");
}

/** The way up was pressed. Never waited on: the link goes on as it would. */
export function promptPressed(key: PromptKey): void {
    send(key, "pressed");
}

/** Says `key` was shown once it is on screen; null shows nothing. */
export function useUpgradePromptShown(key: PromptKey | null): void {
    useEffect(() => {
        if (key) promptShown(key);
    }, [key]);
}
