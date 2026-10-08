import { Button } from "@saroh/ui/button";
import Link from "next/link";

import type { ComposerGate } from "@/lib/messages/composer-gate";

/**
 * What the lead's "Send a message" shows in place of the composer when it
 * can't send (`composerGate`, UX-067): connect a provider where the plan has
 * room, the plan that has it where it hasn't, or — Communications off — a
 * quiet line for someone who may turn it on, and nothing for anyone else.
 * Nothing for `compose`: the composer is shown.
 */
export function ComposerNotice({ gate }: { gate: ComposerGate }) {
    if (gate.kind === "compose") return null;
    if (gate.kind === "off") {
        if (!gate.canManage) return null;
        return (
            <p className="text-pretty text-sm text-muted-foreground">
                Messaging is off for your business.{" "}
                <Link
                    href="/settings/modules"
                    className="font-medium text-foreground underline underline-offset-2"
                >
                    Turn on Communications
                </Link>{" "}
                to write to this lead from here.
            </p>
        );
    }
    return (
        <div
            role="status"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5"
        >
            <p className="min-w-0 flex-[1_1_220px] text-pretty text-sm">
                {gate.title}
            </p>
            <Button asChild variant="outline" size="sm" className="wk-press">
                <Link href={gate.href}>{gate.cta}</Link>
            </Button>
        </div>
    );
}
