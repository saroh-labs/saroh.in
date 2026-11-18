import { NotFound } from "@saroh/ui/not-found";
import { Wordmark } from "@saroh/ui/wordmark";

import { getPublicJson } from "@/lib/api/http";
import { formatDate } from "@/lib/format/datetime";
import type { ChannelKind } from "@/lib/social/saroh-social-types";
import { CHANNEL_SHORT, SOCIAL_WORDS } from "@/lib/social/saroh-social-words";

export const metadata = { title: "Data deletion" };

interface DeletionView {
    code: string;
    kind: ChannelKind;
    channels: number;
    deletedAt: string;
}

/** The codes Saroh gives Meta: base64url, short. */
const CODE = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * Saroh Social's data deletion status (plan saroh-social U8, KTD11): the
 * page Meta sends someone to after they asked Facebook, Instagram or
 * Threads to have Saroh delete their data. Public, outside the workspace
 * (`middleware.ts` leaves it open): it says what was deleted and when,
 * and nothing about any business. The day is UTC's: the person has no
 * business here to take a zone from.
 */
export default async function DeletionStatusPage({
    params,
}: {
    params: Promise<{ code: string }>;
}) {
    const { code } = await params;
    const row = CODE.test(code)
        ? await getPublicJson<DeletionView>(
              `/public/social/deletion/${encodeURIComponent(code)}`,
          )
        : null;
    if (!row) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background">
                <NotFound
                    mark={<Wordmark />}
                    title={SOCIAL_WORDS.deletionMissing}
                    description={SOCIAL_WORDS.deletionMissingWhat}
                    primary={{ href: "/", label: "Open Saroh" }}
                />
            </main>
        );
    }
    const kind = CHANNEL_SHORT[row.kind];
    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4">
            <section
                data-deletion={row.code}
                className="grid w-full max-w-[480px] gap-4 rounded-2xl border border-border bg-card p-6"
            >
                <Wordmark />
                <h1 className="text-[22px] font-semibold tracking-[-0.01em]">
                    {SOCIAL_WORDS.deletionTitle}
                </h1>
                <p className="text-pretty text-[14.5px] leading-[1.6]">
                    {SOCIAL_WORDS.deletionWhat(
                        row.channels,
                        kind,
                        formatDate(row.deletedAt, "UTC", {
                            year: "always",
                        }),
                    )}
                </p>
                <p className="font-mono text-[13px] text-muted-foreground">
                    {SOCIAL_WORDS.deletionCode(row.code)}
                </p>
            </section>
        </main>
    );
}
