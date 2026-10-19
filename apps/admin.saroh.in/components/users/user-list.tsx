import { Badge } from "@saroh/ui/badge";
import Link from "next/link";

import { formatDate, formatRelative, plural } from "@/lib/format";
import type { PersonRow } from "@/lib/people";
import { displayName } from "@/lib/sign-in-words";

/**
 * The Users list's rows (admin console U9, R13). Every row is one link to
 * the user's page. A user with no name shows their email once, as the name.
 */
export function UserList({ people }: { people: PersonRow[] }) {
    return (
        <ul className="grid gap-2" aria-label="Users">
            {people.map((person) => {
                const name = displayName(person);
                return (
                    <li key={person.id}>
                        <Link
                            href={`/users/${person.id}`}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors duration-fast hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="grid min-w-0 gap-0.5">
                                <span className="truncate font-medium">
                                    {name}
                                </span>
                                {name !== person.email && (
                                    <span className="truncate text-sm text-muted-foreground">
                                        {person.email}
                                    </span>
                                )}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                {person.isStaff && (
                                    <Badge variant="info">Staff</Badge>
                                )}
                                {person.isOwner && (
                                    <Badge variant="neutral">Owner</Badge>
                                )}
                                {!person.emailVerified && (
                                    <Badge variant="warning">
                                        Email not verified
                                    </Badge>
                                )}
                                {person.verifiedBy === "staff" && (
                                    <Badge variant="neutral">
                                        Verified by staff
                                    </Badge>
                                )}
                                <span>
                                    {person.businesses === 0
                                        ? "No business yet"
                                        : plural(
                                              person.businesses,
                                              "business",
                                              "businesses",
                                          )}
                                    {" · "}joined{" "}
                                    <time dateTime={person.createdAt}>
                                        {formatDate(person.createdAt)}
                                    </time>
                                    {" · "}
                                    {person.lastSeenAt
                                        ? `seen ${formatRelative(person.lastSeenAt)}`
                                        : "never signed in"}
                                </span>
                            </div>
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
