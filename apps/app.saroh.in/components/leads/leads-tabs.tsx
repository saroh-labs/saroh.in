import { TabStrip } from "@saroh/ui/tabs";

/**
 * Leads | Follow-ups. A page-level switch drawn like Products | Reviews: the
 * follow-ups are the tasks set ON leads, gathered in one list so nothing
 * waits on a lead nobody opens. Links, so `?tab=follow-ups` is an address.
 */
export function LeadsTabs({
    active,
    leadCount,
    taskCount,
}: {
    active: "leads" | "follow-ups";
    leadCount: number;
    taskCount: number | null;
}) {
    return (
        <TabStrip
            label="Leads or follow-ups"
            value={active}
            tabs={[
                {
                    value: "leads",
                    label: "Leads",
                    href: "/leads",
                    count: leadCount,
                },
                {
                    value: "follow-ups",
                    label: "Follow-ups",
                    href: "/leads?tab=follow-ups",
                    // No count when the tasks couldn't be read.
                    count: taskCount ?? undefined,
                },
            ]}
        />
    );
}
