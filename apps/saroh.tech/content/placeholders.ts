/**
 * What only the owner can supply, shown as it is on the page until then. A value
 * here is not a claim yet. A builder never adds one for something the code or a
 * government's own page can settle (`lib/content.test.ts`).
 */
export const placeholders = {
    guideAuthor: "[confirm: guide author and dates]",
    changelog: "[confirm: real changelog entries]",
    supportEmail: "[confirm: support address]",
    companyDetails: "[confirm: registered address and number]",
    legalUpdated: "[confirm: date]",
    dataLocation: "[confirm: country or region]",
    processors: "[confirm: names of the services]",
    dataAfterCancel:
        "[confirm: how long we keep your data after you cancel or leave]",
    liability: "[confirm: liability wording, from a lawyer]",
    governingLaw: "[confirm: governing law and courts]",
} as const;
