import { Badge } from "@saroh/ui/badge";

import { PausedNote } from "@/components/billing/paused-banner";
import { diaryPausedWords } from "@/lib/billing/paused";

/**
 * Team's mark for the people on the diary with no login whom a move to a
 * lower plan paused (#800): each by name with a "Paused" tag, and why in
 * words beneath — never a tag alone (four scenes). They have no row of
 * their own on Team (no login), so they are listed here.
 */
export function PausedDiary({
    people,
}: {
    people: readonly { id: string; label: string }[];
}) {
    if (people.length === 0) return null;
    return (
        <section
            aria-label="Paused on the diary"
            className="space-y-2 rounded-xl border border-border px-4 py-3"
        >
            <p className="text-[12.5px] font-semibold">
                On the diary, no login
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {people.map((p) => (
                    <li
                        key={p.id}
                        className="flex min-w-0 items-center gap-1.5 text-[13.5px]"
                    >
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                            {p.label}
                        </span>
                        <Badge variant="warning" className="shrink-0">
                            Paused
                        </Badge>
                    </li>
                ))}
            </ul>
            <PausedNote>
                {diaryPausedWords(people.map((p) => p.label))}
            </PausedNote>
        </section>
    );
}
