/**
 * A path without its trailing slashes. A loop, not `/\/+$/`: that regex is
 * quadratic on a long run of slashes that doesn't end the string, and paths
 * here come from merchants and visitors (CodeQL js/polynomial-redos).
 */
export function trimTrailingSlashes(path: string): string {
    let end = path.length;
    while (end > 0 && path.charCodeAt(end - 1) === 47) end--;
    return end === path.length ? path : path.slice(0, end);
}
