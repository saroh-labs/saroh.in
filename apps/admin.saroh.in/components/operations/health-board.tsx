import { buttonVariants } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import Link from "next/link";

import type { HealthBoard as Board } from "@/lib/machinery";

import { StateMark } from "./state-mark";

/**
 * The health board: every check in its fixed place, each saying its state
 * in words and what is behind it. A check this instance cannot measure says
 * so instead of showing a tick it has not earned.
 */
export function HealthBoard({ board }: { board: Board | null }) {
    if (!board) {
        return (
            <FailedState
                title="The health board could not be read"
                description="The API did not answer — which is itself the answer to the first check. Try again in a moment."
            />
        );
    }
    return (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {board.checks.map((check) => (
                <li
                    key={check.key}
                    className="grid content-start gap-2 rounded-xl border bg-card p-4"
                >
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {check.label}
                    </p>
                    <StateMark state={check.state} />
                    <p className="text-sm leading-relaxed">{check.summary}</p>
                    {check.action && (
                        <Link
                            href={check.action.href}
                            className={`${buttonVariants({ variant: "ghost", size: "sm" })} justify-self-start`}
                        >
                            {check.action.label}
                        </Link>
                    )}
                </li>
            ))}
        </ul>
    );
}
