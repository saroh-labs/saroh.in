"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@saroh/ui/avatar";
import { RadioCards } from "@saroh/ui/choice-group";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Notice } from "@saroh/ui/notice";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { pickPage } from "@/lib/social/saroh-social-actions";
import type {
    ChannelKind,
    PageChoice,
    Read,
} from "@/lib/social/saroh-social-types";
import { SOCIAL_WORDS } from "@/lib/social/saroh-social-words";
import { useSocialSave } from "@/lib/social/use-social";

/**
 * The Facebook Page to post to, or the Instagram account linked to one,
 * when the sign-in offers several (S2: a radio list in the sheet).
 * Choosing finishes the connect; the choice
 * lasts ten minutes on the API, after which the person connects again.
 */
export function PagePicker({
    kind,
    choiceId,
    pages,
    go,
    onClose,
}: {
    kind: ChannelKind;
    choiceId: string;
    pages: Read<PageChoice[]> | null;
    /** Open an address of Social, in place. */
    go: (href: string) => void;
    onClose: () => void;
}) {
    const { orgId, saved } = useSocialSave();
    const [page, setPage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const list = pages?.ok ? pages.data : [];
    const ig = kind === "INSTAGRAM";
    const title = ig ? SOCIAL_WORDS.pickAccount : SOCIAL_WORDS.pickPage;

    async function choose() {
        if (!page) return setError(title);
        setError(null);
        const res = await runAction(
            () => pickPage(kind, choiceId, page, orgId),
            {
                setBusy,
                quiet: true,
                onUnreached: setError,
            },
        );
        if (!res) return;
        if (!res.ok) return setError(res.error);
        await saved();
        go(
            `/social?tab=channels&channel=${kind.toLowerCase()}&result=connected`,
        );
    }

    return (
        <FormSheet
            open
            bottomOnPhone
            title={title}
            description={
                ig ? SOCIAL_WORDS.pickAccountWhat : SOCIAL_WORDS.pickPageWhat
            }
            pending={busy}
            dirty={page !== null}
            saveLabel={ig ? SOCIAL_WORDS.useAccount : SOCIAL_WORDS.usePage}
            savingLabel={SOCIAL_WORDS.connecting}
            saveOff={list.length === 0}
            onClose={onClose}
            onSubmit={() => choose()}
        >
            {list.length > 0 ? (
                <RadioCards
                    label={title}
                    value={page}
                    onChange={setPage}
                    options={list.map((p) => ({
                        value: p.id,
                        label: ig ? (
                            <span className="flex min-w-0 items-center gap-2">
                                <Avatar size="row">
                                    {p.avatarUrl ? (
                                        <AvatarImage src={p.avatarUrl} alt="" />
                                    ) : null}
                                    <AvatarFallback>
                                        {p.name
                                            .replace("@", "")
                                            .slice(0, 1)
                                            .toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="truncate">{p.name}</span>
                            </span>
                        ) : (
                            p.name
                        ),
                    }))}
                />
            ) : (
                <Notice tone="error" role="alert">
                    {SOCIAL_WORDS.pageLoadFailed(kind)}
                </Notice>
            )}
            {error ? (
                <Notice tone="error" role="alert" data-page-error="">
                    {error}
                </Notice>
            ) : null}
        </FormSheet>
    );
}
