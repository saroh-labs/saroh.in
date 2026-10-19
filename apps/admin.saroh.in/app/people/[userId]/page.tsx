import { redirect } from "next/navigation";

/** People became Users (admin console U9, R13): old links keep working. */
export default async function PersonRedirect({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const { userId } = await params;
    redirect(`/users/${encodeURIComponent(userId)}`);
}
