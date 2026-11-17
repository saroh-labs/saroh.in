import type { ReactNode } from "react";

import { Pill } from "../links/pill";

/**
 * A claim behind its claim switch (DEC-221): drawn only while `on`.
 * Off, it draws nothing, or with `notYet` the "Not available yet" pill
 * (its words the page's). Never the claim itself.
 */
export function Claim({
    on,
    notYet,
    children,
}: {
    on: boolean;
    /** Off, say this instead of nothing: "Not available yet". */
    notYet?: string;
    children: ReactNode;
}) {
    if (on) return <>{children}</>;
    return notYet ? <Pill tone="outline">{notYet}</Pill> : null;
}
