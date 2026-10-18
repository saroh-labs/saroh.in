import { Notice } from "@saroh/ui/notice";
import { notFound } from "next/navigation";

import { Facts, Panel } from "@/components/panel";
import { requireStaff } from "@/lib/console";
import {
    formatDate,
    formatDateTime,
    formatRelative,
    plural,
} from "@/lib/format";
import { getPerson } from "@/lib/people";
import { signInBanner, verifiedWords } from "@/lib/sign-in-words";

/**
 * A user's Overview (admin console U9, R13): a banner when something stops
 * them signing in, with the reason in words, then who they are.
 */
export default async function UserOverview({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const gate = await requireStaff("organization:pii:read");
    if (!gate.ok) return null;
    const { userId } = await params;
    const person = await getPerson(userId);
    if (!person) notFound();
    const banner = signInBanner(person.signIn, formatDateTime);

    return (
        <>
            {banner && (
                <Notice tone="warning" title={banner.title}>
                    {banner.body}
                </Notice>
            )}
            <Panel title="Account">
                {() => (
                    <Facts
                        rows={[
                            ["Email", person.email],
                            ["Email check", verifiedWords(person.verifiedBy)],
                            [
                                "Businesses",
                                person.businesses === 0
                                    ? "No business yet"
                                    : plural(
                                          person.businesses,
                                          "business",
                                          "businesses",
                                      ),
                            ],
                            ["Account since", formatDate(person.createdAt)],
                            ["Last seen", formatRelative(person.lastSeenAt)],
                            [
                                "Signed in on",
                                person.sessions.length === 0
                                    ? "Nowhere right now"
                                    : plural(person.sessions.length, "device"),
                            ],
                            ["Staff", person.isStaff ? "Yes — see Team" : "No"],
                            [
                                "Account id",
                                <span
                                    key="id"
                                    className="break-all font-mono text-[12.5px]"
                                >
                                    {person.id}
                                </span>,
                            ],
                        ]}
                    />
                )}
            </Panel>
        </>
    );
}
