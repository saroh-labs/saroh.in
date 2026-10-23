import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import { UserActions } from "@/components/users/user-actions";
import { UserTabs } from "@/components/users/user-tabs";
import { can, requireStaff } from "@/lib/console";
import { getPerson } from "@/lib/people";
import { displayName } from "@/lib/sign-in-words";

// "User", never their name or address: a tab's title shows in a screen
// share, in history and in bookmarks.
export const metadata = { title: "User" };

/**
 * One user (admin console U9, R13): the header with sign-in help, then the
 * tabs Overview · Businesses · Sign-in · History. The person is read once
 * per request (`getPerson` is cached), here and in the tab below.
 */
export default async function UserLayout({
    params,
    children,
}: {
    params: Promise<{ userId: string }>;
    children: ReactNode;
}) {
    const gate = await requireStaff("organization:pii:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const { userId } = await params;
    const person = await getPerson(userId);
    if (!person) notFound();
    const name = displayName(person);

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Users", name]}
                    title={name}
                    description={
                        name === person.email ? undefined : person.email
                    }
                    actions={
                        can(staff, "people:sign-in-help") ? (
                            <UserActions
                                userId={person.id}
                                name={name}
                                email={person.email}
                                emailVerified={person.emailVerified}
                                held={person.signIn.block === "held"}
                                sessions={person.sessions.length}
                                canEndSessions={can(
                                    staff,
                                    "organization:people:write",
                                )}
                            />
                        ) : undefined
                    }
                />
                <UserTabs userId={person.id} />
                {children}
            </PageContainer>
        </AdminShell>
    );
}
