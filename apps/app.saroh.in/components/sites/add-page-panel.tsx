"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { FilePlus } from "lucide-react";
import { useState } from "react";

import { createPage } from "@/lib/sites/actions";
import type { ModulePageOffer } from "@/lib/sites/page-menu";
import type { CreatePageInput, SitePage } from "@/lib/sites/service";

/** A refusal, in the API's words, and the address it offers instead. */
interface Refusal {
    message: string;
    suggestion?: string;
    /** What to send again with the suggested address. */
    retry?: CreatePageInput;
}

/** The menu's rows: 34px, the design's option. */
export const MENU_ROW =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent coarse:min-h-11";

/**
 * "Add a page" in the editor's page menu (G16): the module pages this site
 * can have now — each kind whose module is on and that the site doesn't have
 * yet, as the API lists them (`addablePageKinds`) — then "Blank page".
 *
 * A module page is added in one press: it takes its kind's address and starts
 * with its kind's sections (G14). A refusal is shown in the API's own words,
 * never as a code (DEC-057), and where it offers another address
 * (`details.suggestion`) the merchant can take it in one more press — offered,
 * never applied for them.
 */
export function AddPagePanel({
    siteId,
    offers,
    onAdded,
    onCancel,
}: {
    siteId: string;
    offers: ModulePageOffer[];
    /** A page went in: open it. */
    onAdded: (page: SitePage) => void;
    onCancel: () => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [refusal, setRefusal] = useState<Refusal | null>(null);
    const [blank, setBlank] = useState(offers.length === 0);
    const [title, setTitle] = useState("");
    const [path, setPath] = useState("");

    async function add(input: CreatePageInput, key: string) {
        setBusy(key);
        setRefusal(null);
        const res = await createPage(siteId, input);
        setBusy(null);
        if (res.ok) {
            onAdded(res.data);
            return;
        }
        setRefusal({
            message: res.error,
            suggestion: res.suggestion,
            retry:
                res.suggestion === undefined
                    ? undefined
                    : { ...input, path: res.suggestion },
        });
    }

    return (
        <div className="grid gap-1 p-[5px]">
            {offers.length > 0 ? (
                <ul aria-label="Pages to add" className="grid gap-0.5">
                    {offers.map((offer) => (
                        <li key={offer.kind}>
                            <button
                                type="button"
                                disabled={busy !== null}
                                aria-busy={busy === offer.kind || undefined}
                                onClick={() =>
                                    void add({ kind: offer.kind }, offer.kind)
                                }
                                className={cn(MENU_ROW, "min-h-[46px] py-1.5")}
                            >
                                <span className="grid min-w-0 flex-1">
                                    <span className="flex items-baseline gap-2">
                                        <span className="font-semibold">
                                            {busy === offer.kind
                                                ? `Adding ${offer.label}…`
                                                : offer.label}
                                        </span>
                                        <span className="font-mono text-[0.6875rem] text-muted-foreground">
                                            {offer.path}
                                        </span>
                                    </span>
                                    <span className="truncate text-[0.71875rem] text-muted-foreground">
                                        {offer.what}
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}

            {blank ? (
                <form
                    className="grid gap-1.5 p-1"
                    onSubmit={(e) => {
                        e.preventDefault();
                        const t = title.trim();
                        const p = path.trim();
                        if (t === "" || p === "") return;
                        void add({ title: t, path: p }, "blank");
                    }}
                >
                    <Input
                        autoFocus
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Page name"
                        aria-label="Page name"
                        className="h-8 text-xs"
                    />
                    <Input
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="/about"
                        aria-label="Page address"
                        className="h-8 font-mono text-xs"
                    />
                    <div className="flex gap-1">
                        <Button
                            type="submit"
                            size="sm"
                            className="h-8 flex-1 text-xs"
                            disabled={busy !== null}
                        >
                            {busy === "blank" ? "Adding…" : "Add page"}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={onCancel}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            ) : (
                <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                        setRefusal(null);
                        setBlank(true);
                    }}
                    className={cn(MENU_ROW, "h-[34px]")}
                >
                    <FilePlus
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="flex-1">Blank page</span>
                </button>
            )}

            {refusal ? (
                <div
                    role="alert"
                    className="grid gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs leading-relaxed text-destructive"
                >
                    <p>{refusal.message}</p>
                    {refusal.suggestion ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 justify-self-start px-2 text-xs text-foreground"
                            disabled={busy !== null}
                            onClick={() => {
                                const retry = refusal.retry;
                                const suggestion = refusal.suggestion;
                                if (
                                    retry?.kind === undefined ||
                                    retry.kind === "FREE"
                                ) {
                                    // A blank page: put the address in its
                                    // field, so the merchant sees it before
                                    // it is added.
                                    if (suggestion) setPath(suggestion);
                                    setRefusal(null);
                                    return;
                                }
                                void add(retry, retry.kind);
                            }}
                        >
                            {refusal.retry?.kind === undefined ||
                            refusal.retry.kind === "FREE"
                                ? `Use ${refusal.suggestion}`
                                : `Add it at ${refusal.suggestion}`}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
