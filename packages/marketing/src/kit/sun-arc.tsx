import { cn } from "../cn";
import { hourOf } from "./time";

/** Where the sun sits on the arc at `at`: 6 am on the left, 6 pm on the right. */
export function sunAt(at: string): { x: number; y: number } {
    const h = Math.min(18, Math.max(6, hourOf(at)));
    const angle = Math.PI * (1 - (h - 6) / 12);
    const r = (n: number) => Math.round(n * 10) / 10;
    return { x: r(60 + 50 * Math.cos(angle)), y: r(55 - 50 * Math.sin(angle)) };
}

const night = (at: string) => {
    const h = hourOf(at);
    return h >= 19 || h < 6;
};

/**
 * The sun's place in the sky at an hour (a scene's rail, a trade tile):
 * a half-circle over a horizon with a Saffron sun on it, or, at night, a
 * dashed arc and the moon. Drawn geometry, no words: `aria-hidden`.
 */
export function SunArc({ at, className }: { at: string; className?: string }) {
    const dark = night(at);
    const sun = sunAt(at);
    return (
        <svg
            viewBox="0 0 120 62"
            aria-hidden
            className={cn("block h-auto w-[96px]", className)}
        >
            <path
                d="M10 55A50 50 0 0 1 110 55"
                fill="none"
                stroke={
                    dark
                        ? "hsl(var(--mk-lamp-meta))"
                        : "hsl(var(--border-strong))"
                }
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeDasharray={dark ? "3 5" : undefined}
            />
            <path
                d="M4 55h112"
                stroke={
                    dark
                        ? "hsl(var(--mk-lamp-meta))"
                        : "hsl(var(--border-strong))"
                }
                strokeWidth="1.9"
                strokeLinecap="round"
            />
            {dark ? (
                // A crescent: a disc with a disc of the night cut from it.
                <path
                    d="M66 10a10 10 0 1 0 0 16a8 8 0 1 1 0-16z"
                    fill="hsl(var(--mk-lamp-saff))"
                />
            ) : (
                <circle
                    cx={sun.x}
                    cy={sun.y}
                    r="7"
                    fill="hsl(var(--brand-500))"
                />
            )}
        </svg>
    );
}
