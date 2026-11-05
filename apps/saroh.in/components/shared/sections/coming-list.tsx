import { ComingList as List } from "@saroh/marketing/coming-list";

import type { ComingItem } from "@/content/coming";
import { byComingGroup, NOT_AVAILABLE_YET } from "@/content/coming";

/** The changelog's Coming next and the Integrations page's Planned list. */
export function ComingList({
    items,
    idPrefix,
}: {
    items: readonly ComingItem[];
    /** Makes each group's heading id unique on the page. */
    idPrefix: string;
}) {
    return (
        <List
            groups={byComingGroup(items)}
            idPrefix={idPrefix}
            mark={NOT_AVAILABLE_YET}
        />
    );
}
