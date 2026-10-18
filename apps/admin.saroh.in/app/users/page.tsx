import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import { UserList } from "@/components/users/user-list";
import { UsersToolbar } from "@/components/users/users-toolbar";
import { requireStaff } from "@/lib/console";
import { plural } from "@/lib/format";
import { listPeople } from "@/lib/people";
import {
    narrowedBy,
    readUserListQuery,
    searchable,
    userListHref,
} from "@/lib/user-filters";

export const metadata = { title: "Users" };

/**
 * Everyone with an account on the instance (admin console U9, R13; People
 * until U9). A search, the chips (No business yet, Email not verified,
 * Owners, Joined this week), or neither: the newest accounts first. Every
 * read is personal data, so it needs its permission and is on the record.
 */
export default async function UsersPage({
    searchParams,
}: {
    searchParams: Promise<{
        q?: string | string[];
        filter?: string | string[];
    }>;
}) {
    const gate = await requireStaff("organization:pii:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const query = readUserListQuery(await searchParams);
    const tooShort = query.q !== "" && !searchable(query.q);
    const rows = tooShort
        ? null
        : await listPeople({ q: query.q, chips: query.chips }).catch(
              () => undefined,
          );
    const narrowed = narrowedBy(query);

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Help customers", "Users"]}
                    title="Users"
                    description="Everyone with an account here: which businesses they belong to, and whether they can sign in."
                />
                <UsersToolbar
                    query={query}
                    count={
                        rows
                            ? rows.length === 0
                                ? undefined
                                : narrowed
                                  ? plural(rows.length, "user")
                                  : `Newest ${plural(rows.length, "user")}`
                            : undefined
                    }
                />

                {tooShort ? (
                    <EmptyPanel
                        title="Keep typing"
                        description="Search with at least two characters of their email, name or account id."
                    />
                ) : rows === undefined ? (
                    <FailedPanel things="users" />
                ) : rows === null || rows.length === 0 ? (
                    narrowed ? (
                        <EmptyPanel
                            kind="no-results"
                            things="users"
                            cause={narrowed}
                            query={query.q}
                            clearHref={userListHref({ q: "", chips: [] })}
                        />
                    ) : (
                        <EmptyPanel
                            title="No users yet"
                            description="Everyone who makes an account shows here."
                        />
                    )
                ) : (
                    <UserList people={rows} />
                )}
            </PageContainer>
        </AdminShell>
    );
}
