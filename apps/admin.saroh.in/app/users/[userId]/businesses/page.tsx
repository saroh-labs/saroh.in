import Link from "next/link";
import { notFound } from "next/navigation";

import { LifecycleBadge } from "@/components/business/lifecycle-badge";
import { Panel } from "@/components/panel";
import { ChangeRole, RemoveMember } from "@/components/people/person-actions";
import { EmptyPanel } from "@/components/states/empty-panel";
import type { LifecycleStatus } from "@/lib/businesses";
import { can, requireStaff } from "@/lib/console";
import { asWords } from "@/lib/format";
import { getPerson } from "@/lib/people";
import { displayName } from "@/lib/sign-in-words";

export const metadata = { title: "User · Businesses" };

/** Every business the user belongs to, and their role in each (U9). */
export default async function UserBusinesses({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const gate = await requireStaff("organization:pii:read");
    if (!gate.ok) return null;
    const { staff } = gate;
    const { userId } = await params;
    const person = await getPerson(userId);
    if (!person) notFound();
    const canWrite = can(staff, "organization:people:write");
    const name = displayName(person);

    return (
        <Panel
            title="Businesses"
            description="Every business they belong to, and their role in each."
        >
            {() =>
                person.memberships.length === 0 ? (
                    <EmptyPanel
                        title="No business yet"
                        description="They have an account but belong to no business."
                    />
                ) : (
                    <ul className="grid gap-2">
                        {person.memberships.map((membership) => (
                            <li
                                key={membership.organizationId}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                            >
                                <div className="grid min-w-0 gap-1">
                                    <Link
                                        href={`/businesses/${membership.organizationId}`}
                                        className="truncate font-medium underline-offset-4 hover:underline"
                                    >
                                        {membership.organizationName}
                                    </Link>
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                        {asWords(membership.role)}
                                        <LifecycleBadge
                                            status={
                                                membership.lifecycleStatus as LifecycleStatus
                                            }
                                        />
                                    </div>
                                </div>
                                {canWrite && (
                                    <div className="flex flex-wrap gap-1">
                                        <ChangeRole
                                            organizationId={
                                                membership.organizationId
                                            }
                                            userId={person.id}
                                            name={name}
                                            role={membership.role}
                                        />
                                        <RemoveMember
                                            organizationId={
                                                membership.organizationId
                                            }
                                            userId={person.id}
                                            name={name}
                                            business={
                                                membership.organizationName
                                            }
                                        />
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )
            }
        </Panel>
    );
}
