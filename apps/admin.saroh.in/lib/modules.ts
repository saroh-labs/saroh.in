/**
 * The module registry's keys and labels, for filters. Mirrors
 * `apps/api.saroh.in/src/modules/capabilities/module-registry.ts`; the
 * business page reads the live list from the API, so this only has to be
 * right for the directory's filter, and an unknown key there matches nothing.
 */
export const MODULE_OPTIONS = [
    { key: "WEBSITE", label: "Website" },
    { key: "CRM", label: "CRM" },
    { key: "APPOINTMENTS", label: "Appointments" },
    { key: "COURSES", label: "Courses" },
    { key: "COMMERCE", label: "Commerce" },
    { key: "PAYMENTS", label: "Payments" },
    { key: "COMMUNICATIONS", label: "Communications" },
    { key: "AUTOMATIONS", label: "Automations" },
    { key: "INSIGHTS", label: "Insights" },
] as const;

const LABEL = new Map<string, string>(
    MODULE_OPTIONS.map((option) => [option.key, option.label]),
);

export function moduleLabel(key: string): string {
    return LABEL.get(key) ?? key;
}
