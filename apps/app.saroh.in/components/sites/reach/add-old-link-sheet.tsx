"use client";

import { FormSheet } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { OptionSelect } from "@saroh/ui/option-select";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { SAVE_LINES } from "@/components/sites/shell/save-footer";
import { runAction } from "@/lib/api/run-action";
import { createSiteRedirect } from "@/lib/sites/actions";
import type { SitePage } from "@/lib/sites/service";

/** "bridal-packages", "/bridal-packages" or a pasted full link → "/bridal-packages". */
export function oldLinkPath(typed: string): string {
    const t = typed.trim().replace(/^https?:\/\/[^/]+/i, "");
    return t.startsWith("/") ? t : `/${t}`;
}

/**
 * Add an old link (WXPLinks): a link printed or shared somewhere else that
 * should open one of the site's pages. The API decides what a legal link is
 * and refuses one a page already uses, in its own words, shown under the
 * field; the sheet stays open with what was typed. Waits for Publish.
 */
export function AddOldLinkSheet({
    siteId,
    host,
    pages,
    open,
    onClose,
}: {
    siteId: string;
    host: string | null;
    pages: readonly Pick<SitePage, "path" | "title">[];
    open: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const [from, setFrom] = useState("");
    const [to, setTo] = useState(pages[0]?.path ?? "/");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fromId = useId();
    const toId = useId();

    function close() {
        setFrom("");
        setError(null);
        onClose();
    }

    async function add() {
        if (from.trim() === "") {
            setError("Type the old link first, for example /old-prices.");
            return;
        }
        const res = await runAction(
            () =>
                createSiteRedirect(siteId, {
                    fromPath: oldLinkPath(from),
                    toPath: to,
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return setError(res.error);
        showSuccess("Old link added. It forwards once you publish.");
        close();
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            title="Add an old link"
            description="For a link printed or shared somewhere else: it opens the page you choose."
            pending={busy}
            saveLabel="Add old link"
            savingLabel="Adding…"
            footNote={SAVE_LINES["on-publish"]}
            onClose={close}
            onSubmit={(e) => {
                e.preventDefault();
                void add();
            }}
        >
            <div className="grid gap-2">
                <Label htmlFor={fromId}>Old link</Label>
                <div className="flex min-w-0 items-center gap-1.5">
                    {host ? (
                        <span className="shrink-0 font-mono text-sm text-muted-foreground">
                            {host}
                        </span>
                    ) : null}
                    <Input
                        id={fromId}
                        value={from}
                        disabled={busy}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${fromId}-error` : undefined}
                        onChange={(e) => {
                            setFrom(e.target.value);
                            setError(null);
                        }}
                        placeholder="/old-prices"
                        className="min-w-0 font-mono"
                    />
                </div>
                {error ? (
                    <p
                        id={`${fromId}-error`}
                        role="alert"
                        className="text-[12px] text-destructive-subtle-foreground"
                    >
                        {error}
                    </p>
                ) : null}
            </div>
            <div className="grid gap-2">
                <Label htmlFor={toId}>Forwards to</Label>
                <OptionSelect
                    id={toId}
                    value={to}
                    disabled={busy}
                    onValueChange={setTo}
                    options={pages.map((p) => ({
                        value: p.path,
                        label: p.title,
                        hint: p.path,
                    }))}
                />
            </div>
        </FormSheet>
    );
}
