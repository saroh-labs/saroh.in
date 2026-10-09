/**
 * What each module is called in the app: the rail's words, not the API's
 * (`CRM` is Contacts, `COMMERCE` is Sell, `APPOINTMENTS` is Bookings). The
 * one place a module's name is kept — the Turn on sheet, Settings › Modules,
 * Home's first run and the template picker all read it (UX-078). The keys
 * stay; only the words change here.
 */
const NAME: Readonly<Partial<Record<string, string>>> = {
    COMMERCE: "Sell",
    APPOINTMENTS: "Bookings",
    CRM: "Contacts",
    WEBSITE: "Website",
    PAYMENTS: "Payments",
    COMMUNICATIONS: "Communications",
    INSIGHTS: "Insights",
    COURSES: "Courses",
    CLASS_PACKS: "Class packs",
    AUTOMATIONS: "Automations",
};

/** A module's name; the API's label, then the key, for one not listed. */
export function moduleName(
    key: string,
    modules?: readonly { key: string; label?: string }[],
): string {
    return NAME[key] ?? modules?.find((m) => m.key === key)?.label ?? key;
}
