import { Badge } from "@saroh/ui/badge";
import { EmptyState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { LifecycleBadge } from "@/components/business/lifecycle-badge";
import { Facts, Panel } from "@/components/panel";
import {
    ChangeRole,
    EndSessions,
    RemoveMember,
} from "@/components/people/person-actions";
import type { LifecycleStatus } from "@/lib/businesses";
import { can, requireStaff } from "@/lib/console";
import {
    asWords,
    formatDate,
    formatDateTime,
    formatRelative,
} from "@/lib/format";
import { getPerson } from "@/lib/people";

export const metadata = { title: "Person" };

/** One person across every business they belong to (plan U6). */
export default async function PersonPage({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const gate = await requireStaff("organization:pii:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const { userId } = await params;
    const person = await getPerson(userId);
    if (!person) notFound();
    const canWrite = can(staff, "organization:people:write");
    const name = person.name ?? person.email;

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["People", name]}
                    title={name}
                    description={person.email}
                    actions={
                        canWrite ? (
                            <EndSessions
                                userId={person.id}
                                count={person.sessions.length}
                            />
                        ) : undefined
                    }
                />

                <Panel title="Account">
                    {() => (
                        <Facts
                            rows={[
                                [
                                    "Email",
                                    person.emailVerified
                                        ? "Verified"
                                        : "Not verified",
                                ],
                                ["Account since", formatDate(person.createdAt)],
                                [
                                    "Last seen",
                                    formatRelative(person.lastSeenAt),
                                ],
                                [
                                    "Staff",
                                    person.isStaff ? "Yes — see Team" : "No",
                                ],
                                [
                                    "Account id",
                                    <span
                                        key="id"
                                        className="font-mono text-[12.5px]"
                                    >
                                        {person.id}
                                    </span>,
                                ],
                            ]}
                        />
                    )}
                </Panel>

                <Panel
                    title="Businesses"
                    description="Every business they belong to, and their role in each."
                >
                    {() =>
                        person.memberships.length === 0 ? (
                            <EmptyState title="They belong to no business" />
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

                <Panel
                    title="Open sessions"
                    description="Where they are signed in right now."
                >
                    {() =>
                        person.sessions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Not signed in anywhere.
                            </p>
                        ) : (
                            <ul className="grid gap-2 text-sm">
                                {person.sessions.map((session) => (
                                    <li
                                        key={session.id}
                                        className="grid gap-0.5 border-l-2 border-border pl-3"
                                    >
                                        <span className="break-words">
                                            {describeAgent(session.userAgent)}
                                        </span>
                                        <span className="font-mono text-[12px] text-muted-foreground">
                                            {session.ipAddress ??
                                                "unknown address"}{" "}
                                            · active{" "}
                                            {formatRelative(
                                                session.lastActiveAt,
                                            )}{" "}
                                            · since{" "}
                                            {formatDateTime(session.createdAt)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )
                    }
                </Panel>
                {person.isStaff && (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="info">Staff</Badge> Their console access
                        is managed on{" "}
                        <Link
                            href="/team"
                            className="underline underline-offset-4"
                        >
                            Team
                        </Link>
                        .
                    </div>
                )}
            </PageContainer>
        </AdminShell>
    );
}

/** A user agent, shortened to the browser and system a person would recognise. */
function describeAgent(agent: string | null): string {
    if (!agent) return "Unknown device";
    const browser = agent.includes("Edg/")
        ? "Edge"
        : agent.includes("Chrome/")
          ? "Chrome"
          : agent.includes("Firefox/")
            ? "Firefox"
            : agent.includes("Safari/")
              ? "Safari"
              : "A browser";
    const system = /iPhone|iPad/.test(agent)
        ? "iOS"
        : agent.includes("Android")
          ? "Android"
          : agent.includes("Mac OS X")
            ? "macOS"
            : agent.includes("Windows")
              ? "Windows"
              : agent.includes("Linux")
                ? "Linux"
                : "an unknown system";
    return `${browser} on ${system}`;
}
