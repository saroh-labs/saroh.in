import type { ReactNode } from "react";

/**
 * Home's first group (DEC-229, plan U13): what waits on the customer — a
 * place held for them, a bill to pay — named for a screen reader as one
 * group. It takes no box of its own (`contents`), so its cards sit in
 * Home's grid like every other card; Home leaves it out when it is empty.
 */
export function WaitingOnYou({ children }: { children: ReactNode }) {
    return (
        <div
            role="group"
            aria-label="Waiting on you"
            data-account-waiting=""
            className="contents"
        >
            {children}
        </div>
    );
}
