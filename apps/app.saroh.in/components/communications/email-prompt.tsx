import { Button } from "@saroh/ui/button";
import Link from "next/link";

import type { EmailPrompt } from "@/lib/communications/email-setup";

/**
 * The prompt to connect the business's own email (DEC-011, amended
 * 2026-10-07): what its customers miss without one, and Connect — or, on a
 * plan that can't connect one (DEC-091), See plans. Settings › Providers
 * draws it above the list; Home says the same in Needs you. Shown only to
 * whoever can act (`emailPrompt`), and gone once a provider is connected.
 *
 * The limit notices' block (`LimitNoticeBlock`): the brand tint, not the
 * destructive one — nothing has broken, it was never set up.
 */
export function EmailPromptBlock({ prompt }: { prompt: EmailPrompt }) {
    // One per page.
    const id = "email-prompt-title";
    const action = prompt.action;
    return (
        <section
            aria-labelledby={id}
            className="flex max-w-[720px] flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[10px] border border-brand-300 bg-brand-subtle px-3.5 py-3 dark:border-brand-700"
        >
            <div className="grid min-w-0 flex-[1_1_320px] gap-1.5">
                <h3
                    id={id}
                    className="text-[13px] font-semibold text-foreground"
                >
                    {prompt.title}
                </h3>
                <p className="text-pretty text-[12.5px] leading-normal text-foreground/80">
                    {prompt.text}
                </p>
            </div>
            {action ? (
                <Button asChild size="sm" className="shrink-0">
                    {/* An anchor on this page is a jump, not a navigation. */}
                    {action.href.startsWith("#") ? (
                        <a href={action.href}>{action.label}</a>
                    ) : (
                        <Link href={action.href}>{action.label}</Link>
                    )}
                </Button>
            ) : null}
        </section>
    );
}
