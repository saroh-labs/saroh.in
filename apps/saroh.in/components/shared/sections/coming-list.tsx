import type { ComingItem } from "@/content/coming";
import { byComingGroup, NOT_AVAILABLE_YET } from "@/content/coming";

import { Pill } from "../links/pill";

/** The 140px "when" column, in JetBrains Mono. */
const WHEN_COL = "flex-[0_0_140px] font-mono text-[13px]";

/**
 * Planned work under its groups (DEC-195, V8): the changelog's Coming next
 * and the Integrations page's Planned list. Each row is marked "Not
 * available yet" and is never a link (R16).
 *
 * The "when" column holds the group's label on a group's first row only
 * (owner, 10 Oct 2026); on the rows after it the column stays as an empty
 * spacer, dropped where the row has wrapped and it would only be a blank
 * line.
 */
export function ComingList({
    items,
    idPrefix,
}: {
    items: readonly ComingItem[];
    /** Makes each group's heading id unique on the page. */
    idPrefix: string;
}) {
    return (
        <div className="grid">
            {byComingGroup(items).map((group) => (
                <ul
                    key={group.key}
                    aria-labelledby={`${idPrefix}-${group.key}`}
                    className="m-0 grid list-none p-0"
                >
                    {group.rows.map((item, index) => (
                        <li
                            key={item.name}
                            className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-border py-5"
                        >
                            {index === 0 ? (
                                <h3
                                    id={`${idPrefix}-${group.key}`}
                                    className={`${WHEN_COL} m-0 font-normal text-muted-foreground`}
                                >
                                    {group.label}
                                </h3>
                            ) : (
                                <span
                                    aria-hidden="true"
                                    className={`${WHEN_COL} max-sm:hidden`}
                                />
                            )}
                            <span className="grid min-w-0 flex-[1_1_380px] gap-1">
                                <span className="text-[17px] font-semibold">
                                    {item.name}
                                </span>
                                <span className="text-[15px] leading-[1.55] text-mk-copy">
                                    {item.line}
                                </span>
                            </span>
                            <Pill
                                tone="outline"
                                className="text-muted-foreground"
                            >
                                {NOT_AVAILABLE_YET}
                            </Pill>
                        </li>
                    ))}
                </ul>
            ))}
        </div>
    );
}
