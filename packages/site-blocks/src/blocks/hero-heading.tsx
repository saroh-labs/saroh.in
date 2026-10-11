import type { ReactNode } from "react";

import type { HeroLevel } from "./hero-level";

/**
 * A hero's headline, as the heading its place on the page makes it: the
 * `h1` for the page's first hero, an `h2` for any later one
 * (`hero-level.ts`). Every hero look draws its headline through this, so
 * the rule is in one place and a look cannot forget it.
 *
 * No `"use client"`: the server's looks and the browser's both draw it.
 */
export function HeroHeading({
    level = 1,
    className,
    children,
}: {
    level?: HeroLevel;
    className?: string;
    children: ReactNode;
}) {
    return level === 1 ? (
        <h1 className={className}>{children}</h1>
    ) : (
        <h2 className={className}>{children}</h2>
    );
}
