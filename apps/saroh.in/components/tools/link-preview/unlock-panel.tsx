"use client";

import type { GateSubmit } from "@saroh/search-pages";
import { EmailGate, ToolGateProvider } from "@saroh/search-pages";

import { linkPreview as copy } from "@/content/link-preview";
import type { UnlockResult } from "@/lib/link-preview";
import { ring } from "@/lib/ring";

export type Unlocked = Extract<UnlockResult, { unlocked: true }>;

/**
 * The fix-it panel (design 1b, the email version, KTD-5): locked, the
 * package's email gate every free tool shares; unlocked, the dark list of
 * fixes from the API's report and the tags to copy. No news tickbox: an address typed into a public tool isn't
 * verified, so it can't say yes to marketing (security review, 5 Oct 2026).
 */
export function UnlockPanel({
    unlocked,
    onUnlock,
}: {
    unlocked: Unlocked | null;
    /** Sends the email for this report; once it's yes, `unlocked` arrives. */
    onUnlock: GateSubmit;
}) {
    if (unlocked) {
        return (
            <section
                aria-labelledby="fixes-title"
                className="grid gap-3 rounded-2xl bg-foreground p-5 text-background"
            >
                <h2 id="fixes-title" className="m-0 text-base font-semibold">
                    {copy.fixTitle(unlocked.fixes.length)}
                </h2>
                <p
                    role="status"
                    className="m-0 text-[12.5px] text-mk-on-ink-muted"
                >
                    {copy.emailed[unlocked.emailed]}
                </p>
                <ol className="m-0 grid list-none gap-3 p-0">
                    {unlocked.fixes.map((fix) => (
                        <li
                            key={fix.key}
                            className="grid gap-[3px] border-t border-mk-ink-hover pt-2.5"
                        >
                            <span className="text-sm font-semibold text-mk-saffron">
                                {fix.title}
                            </span>
                            <span className="text-[13px] leading-[1.5] text-mk-on-ink">
                                {fix.body}
                            </span>
                        </li>
                    ))}
                </ol>
                <span className="text-[12.5px] text-mk-on-ink-muted">
                    {copy.tagsTitle}
                </span>
                <pre
                    tabIndex={0}
                    aria-label={copy.tagsTitle}
                    className={`m-0 overflow-x-auto whitespace-pre-wrap rounded-lg bg-mk-on-ink-hover p-3 font-mono text-[11px] leading-[1.6] text-mk-code [overflow-wrap:anywhere] ${ring({ offset: 0, color: "paper" })}`}
                >
                    {unlocked.suggestedTags}
                </pre>
            </section>
        );
    }

    return (
        // The package's result panel and email gate (DEC-195, A16): dark on
        // a desk, white on a phone, as every free tool's.
        <div className="sp tp !bg-transparent">
            <div className="tp-result">
                <p className="m-0 text-[13.5px] leading-[1.5]">
                    {copy.lockedBody}
                </p>
                <ToolGateProvider privacy="/privacy">
                    <EmailGate
                        label={copy.lockedTitle}
                        button={copy.unlock}
                        note={copy.promise}
                        onSubmit={onUnlock}
                    />
                </ToolGateProvider>
            </div>
        </div>
    );
}
