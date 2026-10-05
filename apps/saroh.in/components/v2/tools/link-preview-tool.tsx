"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { linkPreview as copy } from "@/content/link-preview";
import type { CheckResult, UnlockResult } from "@/lib/link-preview";
import {
    addressProblem,
    checkedLine,
    domainOf,
    failureMessage,
    reportLink,
    splitScheme,
} from "@/lib/link-preview";

import { LinkInput } from "./link-input";
import { CardsGrid, ScorePanel } from "./link-results";
import type { Unlocked } from "./unlock-panel";
import { UnlockPanel } from "./unlock-panel";

type Checked = Extract<CheckResult, { ok: true }>;

type View =
    | { kind: "empty" }
    | { kind: "loading"; domain: string }
    | { kind: "error"; message: string }
    | { kind: "results"; result: Checked };

const GUTTER = "px-mk-gutter";

/**
 * The link preview checker (resources plan U2; design 1b, the email
 * version): one address in, the six cards out, with what to fix behind an
 * email. Every state the design draws — empty with its two examples,
 * loading, each error, results — is one `view`. A result has its own
 * address (`?url=`), so "Copy link to this report" and a shared link open
 * the same check again (R13).
 */
export function LinkPreviewTool({ initialUrl }: { initialUrl?: string }) {
    const first = splitScheme(initialUrl ?? "");
    const [rest, setRest] = useState(first.rest);
    const [scheme, setScheme] = useState<"https" | "http">(
        first.scheme ?? "https",
    );
    const [view, setView] = useState<View>({ kind: "empty" });
    const [unlocked, setUnlocked] = useState<Unlocked | null>(null);
    const [email, setEmail] = useState<{
        email: string;
        consent: boolean;
    } | null>(null);
    const [unlockPending, setUnlockPending] = useState(false);
    const [unlockError, setUnlockError] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const run = useRef(0);

    const unlock = useCallback(
        async (address: string, input: { email: string; consent: boolean }) => {
            setUnlockPending(true);
            setUnlockError(null);
            try {
                const res = await fetch("/api/link-preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...input, url: address }),
                });
                const body = (await res.json()) as UnlockResult;
                if (body.unlocked) {
                    setEmail(input);
                    setUnlocked(body);
                } else {
                    setUnlockError(
                        body.failure === "bad-email"
                            ? copy.badEmail
                            : body.failure === "rate-limited"
                              ? failureMessage("rate-limited", "")
                              : copy.unlockFailed,
                    );
                }
            } catch {
                setUnlockError(copy.unlockFailed);
            } finally {
                setUnlockPending(false);
            }
        },
        [],
    );

    const check = useCallback(
        async (
            address: { scheme: "https" | "http"; rest: string },
            fresh = false,
        ) => {
            const problem = addressProblem(address.rest);
            if (problem) {
                setView({ kind: "error", message: problem });
                return;
            }
            const full = `${address.scheme}://${address.rest.trim()}`;
            const domain = domainOf(full);
            const mine = (run.current += 1);
            setView({ kind: "loading", domain });
            setCopied(null);
            let result: CheckResult;
            try {
                const query = new URLSearchParams({ url: full });
                if (fresh) query.set("fresh", "1");
                const res = await fetch(
                    `/api/link-preview?${query.toString()}`,
                );
                result = (await res.json()) as CheckResult;
            } catch {
                result = { ok: false, url: full, failure: "unavailable" };
            }
            if (mine !== run.current) return; // a newer check started
            if (!result.ok) {
                setView({
                    kind: "error",
                    message: failureMessage(
                        result.failure,
                        domain,
                        result.status,
                    ),
                });
                return;
            }
            setView({ kind: "results", result });
            const shown =
                address.scheme === "http" ? full : address.rest.trim();
            window.history.replaceState(
                null,
                "",
                `?url=${encodeURIComponent(shown)}`,
            );
            // Someone who unlocked once gets each new report too.
            setUnlocked(null);
            if (email) void unlock(result.url, email);
        },
        [email, unlock],
    );

    // A shared report (`?url=…`) opens checked.
    const opened = useRef(false);
    useEffect(() => {
        if (opened.current || !initialUrl) return;
        opened.current = true;
        void check({ scheme, rest });
    }, [initialUrl, check, scheme, rest]);

    const busy = view.kind === "loading";
    const result = view.kind === "results" ? view.result : null;

    async function copyLink() {
        if (!result) return;
        const link = reportLink(window.location.origin, result.url);
        try {
            await navigator.clipboard.writeText(link);
            setCopied(copy.copied);
        } catch {
            setCopied(copy.copyFailed);
        }
    }

    return (
        <>
            <div className={`${GUTTER} pt-[18px]`}>
                <LinkInput
                    value={rest}
                    scheme={scheme}
                    busy={busy}
                    onChange={(next) => {
                        setRest(next.rest);
                        setScheme(next.scheme);
                    }}
                    onSubmit={() => void check({ scheme, rest })}
                />
            </div>

            {view.kind === "empty" ? (
                <div
                    className={`${GUTTER} flex flex-wrap items-center gap-2.5 pt-5 text-sm text-muted-foreground`}
                >
                    <span>{copy.examplesLead}</span>
                    {copy.examples.map((example) => (
                        <button
                            key={example.address}
                            type="button"
                            onClick={() => {
                                setRest(example.address);
                                setScheme("https");
                                void check({
                                    scheme: "https",
                                    rest: example.address,
                                });
                            }}
                            className="h-[34px] cursor-pointer rounded-full border border-border-strong bg-card px-3.5 text-[13.5px] font-semibold text-foreground transition-colors duration-fast ease-out hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:bg-muted"
                        >
                            {example.label}
                        </button>
                    ))}
                    <span className="basis-full">{copy.examplesNote}</span>
                </div>
            ) : null}

            {view.kind === "loading" ? (
                <div
                    role="status"
                    className={`${GUTTER} flex items-center gap-3 pt-7 text-[15px] text-mk-copy`}
                >
                    <span
                        aria-hidden
                        className="size-2.5 shrink-0 animate-pulse rounded-full bg-brand-500 motion-reduce:animate-none"
                    />
                    {copy.loading(view.domain)}
                </div>
            ) : null}

            {view.kind === "error" ? (
                <div className={`${GUTTER} pt-5`}>
                    <div
                        role="alert"
                        className="rounded-xl bg-mk-bad-bg px-[18px] py-4 text-[15px] leading-[1.5] text-mk-bad [overflow-wrap:anywhere]"
                    >
                        {view.message}
                    </div>
                </div>
            ) : null}

            {result ? (
                <>
                    <div
                        className={`${GUTTER} flex flex-wrap items-center gap-2.5 pt-7`}
                    >
                        <span className="mr-auto text-[13.5px] text-muted-foreground">
                            {copy.gridNote}{" "}
                            {result.sample
                                ? copy.sampleNote
                                : checkedLine(result.checkedAt)}
                        </span>
                        <div className="flex flex-wrap gap-2.5">
                            <button
                                type="button"
                                onClick={() =>
                                    void check({ scheme, rest }, true)
                                }
                                className="h-[38px] cursor-pointer rounded-[9px] border border-border-strong bg-transparent px-3.5 text-sm font-semibold text-foreground transition-colors duration-fast ease-out hover:bg-mk-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:bg-muted"
                            >
                                {copy.checkAgain}
                            </button>
                            <button
                                type="button"
                                onClick={() => void copyLink()}
                                className="h-[38px] cursor-pointer rounded-[9px] border-none bg-foreground px-3.5 text-sm font-semibold text-background transition-colors duration-fast ease-out hover:bg-mk-ink-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:bg-mk-on-ink-hover"
                            >
                                {copied === copy.copied
                                    ? copy.copied
                                    : copy.copyLink}
                            </button>
                        </div>
                        <span
                            role="status"
                            className="basis-full text-[13px] text-muted-foreground empty:hidden"
                        >
                            {copied && copied !== copy.copied ? copied : ""}
                        </span>
                    </div>
                    <div
                        className={`${GUTTER} grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-6 pt-4`}
                    >
                        <aside className="grid min-w-0 gap-4">
                            <ScorePanel result={result} />
                            <UnlockPanel
                                unlocked={unlocked}
                                pending={unlockPending}
                                error={unlockError}
                                onUnlock={(input) =>
                                    void unlock(result.url, input)
                                }
                            />
                        </aside>
                        <CardsGrid
                            result={result}
                            unlocked={unlocked !== null}
                        />
                    </div>
                </>
            ) : null}
        </>
    );
}
