import { notFound } from "next/navigation";

import { Facts, Panel } from "@/components/panel";
import { ConfirmEmailChange } from "@/components/users/user-actions";
import { can, requireStaff } from "@/lib/console";
import { formatDateTime, formatRelative } from "@/lib/format";
import { getPerson } from "@/lib/people";
import {
    codesWords,
    mayConfirmChange,
    verifiedWords,
} from "@/lib/sign-in-words";
import { describeAgent } from "@/lib/user-agent";

export const metadata = { title: "User · Sign-in" };

/**
 * How the user signs in (admin console U9, R13): whose word their email
 * rests on, the last sign-in email change and its hold, the codes staff
 * sent, and where they are signed in now.
 */
export default async function UserSignIn({
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
    const { signIn } = person;
    const change = signIn.lastChange;
    const helps = can(staff, "people:sign-in-help");

    return (
        <>
            <Panel title="Email">
                {() => (
                    <Facts
                        rows={[
                            ["Signs in with", person.email],
                            ["Email check", verifiedWords(signIn.verifiedBy)],
                            ...(signIn.verifiedByStaffAt
                                ? ([
                                      [
                                          "Marked verified",
                                          `${formatDateTime(signIn.verifiedByStaffAt)}, by Saroh staff. It doesn't count as their own until they sign in with a code.`,
                                      ],
                                  ] as [string, string][])
                                : []),
                        ]}
                    />
                )}
            </Panel>

            {change && (
                <Panel
                    title="Sign-in email change"
                    description={
                        change.held
                            ? "Held: no sign-in code goes to the new address and no sign-in works until the hold ends, unless a second staff member confirms."
                            : "The last change Saroh staff made."
                    }
                    actions={
                        helps && mayConfirmChange(signIn, staff.userId) ? (
                            <ConfirmEmailChange
                                userId={person.id}
                                newEmail={change.newEmail}
                                requestedBy={
                                    change.requestedByName ?? "A staff member"
                                }
                            />
                        ) : undefined
                    }
                >
                    {() => (
                        <Facts
                            rows={[
                                ["From", change.oldEmail],
                                ["To", change.newEmail],
                                [
                                    "Changed",
                                    `${formatDateTime(change.createdAt)} by ${change.requestedByName ?? "a staff member who has left"}`,
                                ],
                                [
                                    "Code",
                                    change.held
                                        ? `Held until ${formatDateTime(change.codeHeldUntil)}`
                                        : change.confirmedAt
                                          ? `Sent ${formatDateTime(change.confirmedAt)}, when a second staff member confirmed`
                                          : change.codeSentAt
                                            ? `Sent ${formatDateTime(change.codeSentAt)}, when the hold ended`
                                            : "Not sent: their address changed again",
                                ],
                            ]}
                        />
                    )}
                </Panel>
            )}

            <Panel
                title="Sign-in codes from Saroh staff"
                description="At most three to one person an hour, and twenty from one staff member."
            >
                {() => (
                    <Facts
                        rows={[
                            ["This hour", codesWords(signIn)],
                            [
                                "Last sent",
                                signIn.lastCodeSentAt
                                    ? formatRelative(signIn.lastCodeSentAt)
                                    : "Never",
                            ],
                        ]}
                    />
                )}
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
                                    className="grid min-w-0 gap-0.5 border-l-2 border-border pl-3"
                                >
                                    <span className="break-words">
                                        {describeAgent(session.userAgent)}
                                    </span>
                                    <span className="break-all font-mono text-[12px] text-muted-foreground">
                                        {session.ipAddress ?? "unknown address"}{" "}
                                        · active{" "}
                                        {formatRelative(session.lastActiveAt)} ·
                                        since{" "}
                                        {formatDateTime(session.createdAt)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )
                }
            </Panel>
        </>
    );
}
