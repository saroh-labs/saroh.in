/**
 * What only the owner can supply, shown as it is on the page until then. A value
 * here is not a claim yet. A builder never adds one for something the code or a
 * government's own page can settle (`lib/content.test.ts`).
 */
export const placeholders = {
    guideAuthor: "[confirm: guide author and dates]",
    changelog: "[confirm: real changelog entries]",
} as const;
