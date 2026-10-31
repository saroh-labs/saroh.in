import type { SearchPageCheck } from "./checks";

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
            severity,
        });
    return { out, add };
}
