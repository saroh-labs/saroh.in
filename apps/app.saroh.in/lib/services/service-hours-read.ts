import type { StaffList } from "@/lib/staff/types";

import type { ServiceHours } from "./diary";
import type { Service } from "./service";
import { listRules } from "./service";
import { bookableOwnHours, serviceHoursOf } from "./service-hours";

/**
 * Read the services' own hours, only while nobody is on the diary — with
 * people, each person's hours draw their column instead. Null otherwise,
 * or when the staff read failed.
 */
export async function readServiceHours(
    services: readonly Service[],
    list: StaffList | null,
): Promise<ServiceHours | null> {
    if (!list || list.staff.some((p) => p.status === "ACTIVE")) return null;
    const own = bookableOwnHours(services);
    if (own.length === 0) return null;
    const rules = await Promise.all(own.map((s) => listRules(s.id)));
    return serviceHoursOf(rules, list.closures);
}
