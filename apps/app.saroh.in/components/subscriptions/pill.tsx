import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";

import type { Tone } from "@/lib/subscriptions/view";

const VARIANT = {
    ok: "success",
    accent: "draft",
    bad: "error",
    off: "neutral",
} as const;

/**
 * The design's small uppercase state pill, on the shared `Badge` variants:
 * the state said in words, the hue only reinforcing it.
 */
export function Pill({
    tone,
    children,
    className,
}: {
    tone: Tone;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <Badge
            variant={VARIANT[tone]}
            className={cn(
                "shrink-0 whitespace-nowrap rounded-full border-0 px-2 py-0.5 text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.04em]",
                className,
            )}
        >
            {children}
        </Badge>
    );
}
