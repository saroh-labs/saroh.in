import { redirect } from "next/navigation";

import { readUserListQuery, userListHref } from "@/lib/user-filters";

/** People became Users (admin console U9, R13): old links keep working. */
export default async function PeopleRedirect({
    searchParams,
}: {
    searchParams: Promise<{ q?: string | string[] }>;
}) {
    redirect(userListHref(readUserListQuery(await searchParams)));
}
