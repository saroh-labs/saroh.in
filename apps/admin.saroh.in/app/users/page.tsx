import { buttonVariants } from "@saroh/ui/button";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

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
    readUserPage,
    searchable,
    USER_CHIP_LABEL,
    userListHref,
    userPageHref,
} from "@/lib/user-filters";

/** The API's page: `LIST_LIMIT` in `admin-people.service.ts`. */
const PAGE_SIZE = 50;

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
        page?: string | string[];
    }>;
}) {
    const gate = await requireStaff("organization:pii:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const params = await searchParams;
    const query = readUserListQuery(params);
    const pageNumber = readUserPage(params.page);
    const tooShort = query.q !== "" && !searchable(query.q);
    const result = tooShort
        ? null
        : await listPeople({
              q: query.q,
              chips: query.chips,
              page: pageNumber,
          }).catch(() => undefined);
    const rows = result ? result.items : result;
    const narrowed = narrowedBy(query);
    const first = (pageNumber - 1) * PAGE_SIZE + 1;

    return (
        <AdminShell staff={staff}>
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Help customers", "Users"]}
                    title="Users"
                    description="Everyone with an account here: which businesses they belong to, and whether they can sign in."
                />
                <UsersToolbar
                    query={query}
                    count={
                        rows && rows.length > 0
                            ? countWords({
                                  first,
                                  shown: rows.length,
                                  more: result?.nextPage !== undefined,
                                  narrowed: narrowed !== null,
                                  chips: query.chips.map(
                                      (chip) => USER_CHIP_LABEL[chip],
                                  ),
                              })
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
                    <>
                        <UserList people={rows} />
                        {(pageNumber > 1 || result?.nextPage) && (
                            <nav
                                aria-label="Pages of users"
                                className="flex flex-wrap justify-end gap-2"
                            >
                                {pageNumber > 1 && (
                                    <Link
                                        href={userPageHref(
                                            query,
                                            pageNumber - 1,
                                        )}
                                        className={buttonVariants({
                                            variant: "ghost",
                                            size: "sm",
                                        })}
                                    >
                                        Previous page
                                    </Link>
                                )}
                                {result?.nextPage && (
                                    <Link
                                        href={userPageHref(
                                            query,
                                            result.nextPage,
                                        )}
                                        className={buttonVariants({
                                            variant: "outline",
                                            size: "sm",
                                        })}
                                    >
                                        Next page
                                    </Link>
                                )}
                            </nav>
                        )}
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}

/**
 * How many show, and of what: "Newest 1–50 users · more on the next page",
 * never a bare "50 users" that reads as a total (admin audit F5). Chips
 * together say they all apply.
 */
function countWords(input: {
    first: number;
    shown: number;
    more: boolean;
    narrowed: boolean;
    chips: string[];
}): string {
    const range =
        input.first === 1 && !input.more
            ? plural(input.shown, "user")
            : `Users ${input.first}–${input.first + input.shown - 1}`;
    const which = input.narrowed ? range : `Newest ${range.toLowerCase()}`;
    const all =
        input.chips.length > 1
            ? ` · ${input.chips.join(" and ")}, all at once`
            : "";
    return `${which}${all}${input.more ? " · more on the next page" : ""}`;
}
