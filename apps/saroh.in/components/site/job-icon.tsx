import type { IconName } from "@/lib/site-content";
import { ICON } from "@/lib/site-content";

/** The design's job icons: one stroke path each, drawn in currentColor. */
export function JobIcon({
    name,
    className,
}: {
    name: IconName;
    className?: string;
}) {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
            <path
                d={ICON[name]}
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
