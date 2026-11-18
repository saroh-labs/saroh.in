"use client";

import { RadioCards } from "@saroh/ui/choice-group";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Notice } from "@saroh/ui/notice";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { pickPage } from "@/lib/social/saroh-social-actions";
import type { PageChoice, Read } from "@/lib/social/saroh-social-types";
import { SOCIAL_WORDS } from "@/lib/social/saroh-social-words";

/**
 * The Facebook Page to post to, when the sign-in manages several (S2:
 * a radio list in the sheet). Choosing finishes the connect; the choice
 * lasts ten minutes on the API, after which the person connects again.
 */
export function PagePicker({
    choiceId,
    pages,
    onClose,
}: {
    choiceId: string;
    pages: Read<PageChoice[]> | null;
    onClose: () => void;
}) {
    const router = useRouter();
    const [page, setPage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const list = pages?.ok ? pages.data : [];

    async function choose() {
        if (!page) return setError(SOCIAL_WORDS.pickPage);
        setError(null);
        const res = await runAction(() => pickPage(choiceId, page), {
            setBusy,
            quiet: true,
            onUnreached: setError,
        });
        if (!res) return;
        if (!res.ok) return setError(res.error);
        router.replace(
            "/social?tab=channels&channel=facebook&result=connected",
            { scroll: false },
        );
        router.refresh();
    }

    return (
        <FormSheet
            open
            bottomOnPhone
            title={SOCIAL_WORDS.pickPage}
            description={SOCIAL_WORDS.pickPageWhat}
            pending={busy}
            dirty={page !== null}
            saveLabel={SOCIAL_WORDS.usePage}
            savingLabel={SOCIAL_WORDS.connecting}
            saveOff={list.length === 0}
            onClose={onClose}
            onSubmit={() => choose()}
        >
            {list.length > 0 ? (
                <RadioCards
                    label={SOCIAL_WORDS.pickPage}
                    value={page}
                    onChange={setPage}
                    options={list.map((p) => ({ value: p.id, label: p.name }))}
                />
            ) : (
                <Notice tone="error" role="alert">
                    {SOCIAL_WORDS.pageLoadFailed}
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
