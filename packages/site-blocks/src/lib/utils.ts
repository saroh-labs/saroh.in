import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The package's own `cn`.
 *
 * Deliberately not imported from `@saroh/ui`: that package is Saroh's brand
 * layer, and a block one import away from `bg-primary` is a block that will
 * eventually use one. `apps/app.saroh.in`'s section preview was built from 35
 * usages of Saroh's palette, so a merchant previewing their bakery saw Saroh's
 * colours and nothing they chose could change them. Gate G1 is what stops that
 * happening again; this three-line file is what makes G1 affordable.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * A path without its trailing slashes. A loop, not `/\/+$/`, which is
 * quadratic on a long run of slashes that doesn't end the string
 * (CodeQL js/polynomial-redos).
 */
export function trimTrailingSlashes(path: string): string {
    let end = path.length;
    while (end > 0 && path.charCodeAt(end - 1) === 47) end--;
    return end === path.length ? path : path.slice(0, end);
}
