/**
 * What the admin lists as "Checked before you publish", and what the
 * package's tests hold every page to. Ported from the for-d generator's data
 * checks (gen.py, 26 Oct 2026): they read the page as drawn, so a word from
 * another trade or a claim Saroh can't make is caught wherever it sits.
 */
export interface SearchPageCheck {
    id: string;
    ok: boolean;
    /** What is checked, in plain words. */
    title: string;
    /** When it fails, what and where; empty when it passes. */
    detail: string;
    /** How many problems it found: 0 when it passes. */
    count: number;
    /** Each problem on its own, for a list (`detail` is them joined). */
    problems?: string[];
    severity: "error" | "warning";
}

/** A page's check list, and `add`, which records one check: it passes when `problems` is empty. */
export function checkList() {
    const out: SearchPageCheck[] = [];
    const add = (
        id: string,
        title: string,
        problems: string[],
        severity: SearchPageCheck["severity"] = "error",
    ) =>
        out.push({
            id,
            ok: problems.length === 0,
            title,
            detail: problems.join(" "),
            count: problems.length,
            problems,
            severity,
        });
    return { out, add };
}
