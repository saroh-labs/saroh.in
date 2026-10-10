/**
 * What each settings tab says when it couldn't be read ("Saroh Settings"
 * design, F12): what couldn't be read, that nothing changed, and — where
 * it matters — that nothing will be saved over what can't be seen. Business,
 * Team, Modules and Providers are the design's words; the other tabs follow
 * them.
 */
export type SettingsSection =
    | "organization"
    | "people"
    | "modules"
    | "providers"
    | "share"
    | "activity"
    | "billing"
    | "profile";

export const SECTION_FAILURE: Record<
    SettingsSection,
    { heading: string; title: string; body: string }
> = {
    organization: {
        heading: "Business",
        title: "Business details could not be loaded",
        body: "Nothing has changed — this screen could not read them. Editing is unavailable until it can, so nothing is saved over details we cannot see.",
    },
    people: {
        heading: "Team",
        title: "The team could not be loaded",
        body: "Something went wrong on our side. Nobody has been removed and no role has changed — this screen could not read who is in this business. Editing is unavailable until it can.",
    },
    modules: {
        heading: "Modules",
        title: "Modules could not be loaded",
        body: "Nothing has been turned on or off — this screen could not read what this business runs on. Try again in a moment.",
    },
    providers: {
        heading: "Providers",
        title: "Providers could not be loaded",
        body: "Every connection is as it was — this screen could not read them. Sites, email and payments keep working.",
    },
    share: {
        heading: "Share",
        title: "Your QR codes could not be loaded",
        body: "Every code is as it was and the printed ones keep working — this screen could not read them. Try again in a moment.",
    },
    activity: {
        heading: "Activity",
        title: "Activity could not be loaded",
        body: "Nothing has changed — this screen could not read who changed what. Every change is still recorded.",
    },
    billing: {
        heading: "Plan and billing",
        title: "Plan and billing could not be loaded",
        body: "Your plan is as it was and nothing has been charged — this screen could not read it. Try again in a moment.",
    },
    profile: {
        heading: "Your profile",
        title: "Your profile could not be loaded",
        body: "Nothing has changed — this screen could not read your details or alerts. Try again in a moment.",
    },
};
