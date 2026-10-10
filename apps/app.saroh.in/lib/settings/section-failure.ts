/**
 * What each settings tab says when it couldn't be read ("Saroh Settings"
 * design, F12). The title and the first sentence are the app's one
 * ("Couldn't load {things}", "Nothing has been changed."); a tab adds only
 * the reassurance that is true of it, where it has one.
 */
export type SettingsSection =
    | "organization"
    | "people"
    | "modules"
    | "providers"
    | "share"
    | "activity"
    | "billing"
    | "profile"
    | "data";

export const SECTION_FAILURE: Record<
    SettingsSection,
    { heading: string; things: string; reassurance?: string }
> = {
    organization: {
        heading: "Business",
        things: "your business details",
        reassurance:
            "Editing is off until they load, so nothing is saved over details you can't see.",
    },
    people: {
        heading: "Team",
        things: "the team",
        reassurance: "Nobody has been removed and no role has changed.",
    },
    modules: {
        heading: "Modules",
        things: "modules",
        reassurance: "Nothing has been turned on or off.",
    },
    providers: {
        heading: "Providers",
        things: "providers",
        reassurance: "Your website, email and payments keep working.",
    },
    share: {
        heading: "Share",
        things: "your QR codes",
        reassurance: "The printed ones keep working.",
    },
    activity: {
        heading: "Activity",
        things: "activity",
        reassurance: "Every change is still recorded.",
    },
    billing: {
        heading: "Plan and billing",
        things: "Plan and billing",
        reassurance: "Your plan is as it was and nothing has been charged.",
    },
    profile: {
        heading: "Your profile",
        things: "your profile",
    },
    data: {
        heading: "Your data",
        things: "your downloads",
        reassurance:
            "A download already being prepared carries on, and its link is still emailed to you.",
    },
};
