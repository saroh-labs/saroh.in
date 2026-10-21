// The module keys on their own, so a file that only names a module (the
// notice switches) need not import the registry and its billing reads.

/** The optional-module set. AI is excluded under DEC-015. */
export const MODULE_KEYS = [
    "WEBSITE",
    "CRM",
    "APPOINTMENTS",
    "COURSES",
    "CLASS_PACKS",
    "COMMERCE",
    "PAYMENTS",
    "COMMUNICATIONS",
    "AUTOMATIONS",
    "INSIGHTS",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
