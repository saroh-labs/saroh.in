"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * The hero's wires (FADesk): a dashed curve from each row Ask AI read to
 * where it lands in the answer. Measured from the laid-out rows, not fixed
 * coordinates, so copy and widths can change: the paths are recomputed
 * whenever the stage resizes. Each pair is two `data-wire` names inside
 * `children`. Drawn from 1080px wide, where the rows sit side by side.
 */
export function Wires({
    pairs,
    children,
    className,
}: {
    pairs: readonly (readonly [string, string])[];
    children: ReactNode;
    className?: string;
}) {
    const stage = useRef<HTMLDivElement>(null);
    const [paths, setPaths] = useState<
        { d: string; a: [number, number]; b: [number, number] }[]
    >([]);

    useEffect(() => {
        const root = stage.current;
        if (!root) return;
        const draw = () => {
            if (window.innerWidth < 1080) return setPaths([]);
            const box = root.getBoundingClientRect();
            const at = (name: string) =>
                root
                    .querySelector(`[data-wire="${name}"]`)
                    ?.getBoundingClientRect();
            setPaths(
                pairs.flatMap(([from, to]) => {
                    const f = at(from);
                    const t = at(to);
                    if (!f || !t) return [];
                    const a: [number, number] = [
                        f.right - box.left,
                        f.top + f.height / 2 - box.top,
                    ];
                    const b: [number, number] = [
                        t.left - box.left,
                        t.top + t.height / 2 - box.top,
                    ];
                    const mid = (a[0] + b[0]) / 2;
                    return [
                        {
                            d: `M${a[0]},${a[1]} C${mid},${a[1]} ${mid},${b[1]} ${b[0]},${b[1]}`,
                            a,
                            b,
                        },
                    ];
                }),
            );
        };
        draw();
        const watch = new ResizeObserver(draw);
        watch.observe(root);
        return () => watch.disconnect();
    }, [pairs]);

    return (
        <div ref={stage} className={`relative ${className ?? ""}`}>
            {children}
            <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 size-full overflow-visible"
            >
                {paths.map((p, i) => (
                    <g key={i} className="text-mk-hint">
                        <path
                            d={p.d}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeDasharray="5 5"
                        />
                        <circle
                            cx={p.a[0]}
                            cy={p.a[1]}
                            r="4"
                            fill="hsl(var(--background))"
                            stroke="currentColor"
                            strokeWidth="1.5"
                        />
                        <circle
                            cx={p.b[0]}
                            cy={p.b[1]}
                            r="4"
                            fill="hsl(var(--background))"
                            stroke="currentColor"
                            strokeWidth="1.5"
                        />
                    </g>
                ))}
            </svg>
        </div>
    );
}
