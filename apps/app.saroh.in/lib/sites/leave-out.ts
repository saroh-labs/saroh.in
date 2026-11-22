import { count } from "@/lib/format/plural";
import type { ChangeUnit, SiteChanges } from "@/lib/sites/service";

/**
 * Leave out, in the Publish sheet (plan 2026-11-18-001 U11, KTD-5/6). Pure,
 * so the rules are tested apart from the sheet that draws them.
 */

type Unit = Pick<ChangeUnit, "key" | "requires"> & {
    approval?: Pick<ChangeUnit["approval"], "state"> | null;
};

/** A teammate's change that still waits for someone's approval (DEC-226). */
export function waitsForApproval(unit: Unit, approvalRequired: boolean) {
    const state = unit.approval?.state;
    return approvalRequired && (state === "waiting" || state === "asked");
}

/**
 * Left out before anyone presses anything: with "Publishing needs approval"
 * on, a teammate's change nobody approved yet (U9).
 */
export function defaultLeftOut(
    changes: {
        units: readonly Unit[];
        approvalRequired?: SiteChanges["approvalRequired"];
    } | null,
): Set<string> {
    const required = changes?.approvalRequired === true;
    return new Set(
        (changes?.units ?? [])
            .filter((u) => waitsForApproval(u, required))
            .map((u) => u.key),
    );
}

/**
 * What a publish leaves out: the chosen, and every change that needs one of
 * them (a section on a page left out goes with its page), as the API does
 * (`alsoLeftOut`, U8). Left out by a choice, or with it.
 */
export function withDependants(
    units: readonly Unit[],
    chosen: ReadonlySet<string>,
): Set<string> {
    const out = new Set(
        Array.from(chosen).filter((k) => units.some((u) => u.key === k)),
    );
    let grew = true;
    while (grew) {
        grew = false;
        for (const u of units) {
            if (!out.has(u.key) && u.requires.some((r) => out.has(r))) {
                out.add(u.key);
                grew = true;
            }
        }
    }
    return out;
}

/** Whether this person may put a waiting change in: an owner's override. */
export function mayInclude(
    unit: Unit,
    approvalRequired: boolean,
    canOverride: boolean,
): boolean {
    return canOverride || !waitsForApproval(unit, approvalRequired);
}

/** Including a change that waits for approval is the owner's override. */
export function includesWaiting(
    units: readonly Unit[],
    leftOut: ReadonlySet<string>,
    approvalRequired: boolean,
): boolean {
    return units.some(
        (u) => !leftOut.has(u.key) && waitsForApproval(u, approvalRequired),
    );
}

/** "Publish 4 of 5 changes now", or "Publish 5 changes now" for them all. */
export function publishLabel(total: number, included: number): string {
    return included < total
        ? `Publish ${included} of ${count(total, "change")} now`
        : `Publish ${count(total, "change")} now`;
}
