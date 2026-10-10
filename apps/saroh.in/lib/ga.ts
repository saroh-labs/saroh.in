/**
 * The Google Analytics measurement id to load, or none. GA counts only the
 * real site: a production deployment (`VERCEL_ENV=production`, which its
 * Worker's wrangler.jsonc sets) with an id set. Everywhere else
 * (local dev, previews, CI and `prepush` browser runs) there is no tag, so
 * none of them shows up as a visitor, even with the id copied into a local
 * `.env`.
 */
export function gaMeasurementId(input: {
    id: string | undefined;
    vercelEnv: string | undefined;
}): string | undefined {
    return input.vercelEnv === "production" && input.id ? input.id : undefined;
}

/**
 * Every tag saroh.in may load, each by its public id: Google Analytics, and
 * the two advertising tags (DEC-127), Google Ads (`AW-…`, with the label of
 * each conversion action) and the Meta Pixel. An id that isn't here loads
 * nothing and sends nothing.
 */
export interface TagConfig {
    gaId?: string;
    adsId?: string;
    /** Google Ads' label for "joined the waitlist"; needs `adsId`. */
    adsWaitlistLabel?: string;
    /** Google Ads' label for "finished signing up"; needs `adsId`. */
    adsSignupLabel?: string;
    pixelId?: string;
    /**
     * Session replay is switched on here (DEC-125, `lib/site-recording.ts`).
     * Not a third party's tag: Saroh's own recorder, which waits for the
     * same notice, so the notice has to know to ask about it.
     */
    recording?: boolean;
}

/**
 * The tags this deployment loads: the ids that are set, on a production
 * deployment only, by the same rule as {@link gaMeasurementId}. Anywhere
 * else it is empty, so a test run is never an ad conversion.
 */
export function tagConfig(input: {
    gaId: string | undefined;
    adsId: string | undefined;
    adsWaitlistLabel: string | undefined;
    adsSignupLabel: string | undefined;
    pixelId: string | undefined;
    vercelEnv: string | undefined;
}): TagConfig {
    if (input.vercelEnv !== "production") return {};
    const config: TagConfig = {};
    if (input.gaId) config.gaId = input.gaId;
    if (input.adsId) {
        config.adsId = input.adsId;
        if (input.adsWaitlistLabel)
            config.adsWaitlistLabel = input.adsWaitlistLabel;
        if (input.adsSignupLabel) config.adsSignupLabel = input.adsSignupLabel;
    }
    if (input.pixelId) config.pixelId = input.pixelId;
    return config;
}

/** Whether saroh.in advertises here: either advertising tag has its id. */
export const hasAdTags = (config: TagConfig): boolean =>
    Boolean(config.adsId) || Boolean(config.pixelId);

/**
 * Whether anything here waits for the cookie notice: a tag's id, or the
 * recorder's switch. Without any, no notice shows and "Cookie choices" has
 * nothing to take back.
 */
export const asksConsent = (config: TagConfig): boolean =>
    Boolean(config.gaId) || hasAdTags(config) || Boolean(config.recording);
