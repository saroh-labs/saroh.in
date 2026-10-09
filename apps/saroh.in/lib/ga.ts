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
