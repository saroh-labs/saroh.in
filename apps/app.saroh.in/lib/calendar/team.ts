import type {
    CalendarDay,
    CalendarItem,
    CalendarMonth,
    LayerDay,
    LayerKey,
    MoneyCell,
    MoneyEntry,
} from "./types";

/**
 * The calendar's team filter (plan 005 E24, R16): Everyone, or one person,
 * after the "Saroh Business Calendar" design. Pure, so the rules are tested
 * without a browser; the screen only draws them.
 *
 * The API names the team only to a caller who reads bookings (E20,
 * `booking:read`), so nobody else is offered the filter, and it can only
 * narrow what this viewer was sent: a person's bookings and classes, and the
 * money on them. Orders, pick-ups, renewals and invoices belong to nobody on
 * the team, so they leave the month while a person is picked, as the design
 * draws it.
 */

export interface TeamOption {
    id: string;
    name: string;
}

/**
 * Who the filter lists. None — so no filter — unless the business has a
 * team of two or more and this viewer may see who they are: a business of
 * one has no one else to filter out (the design's rule).
 */
export function teamOptions(
    month: Pick<CalendarMonth, "hasStaff" | "staff">,
): TeamOption[] {
    if (!month.hasStaff) return [];
    const staff = month.staff ?? [];
    return staff.length > 1 ? staff.map(({ id, name }) => ({ id, name })) : [];
}

/** `?team=`: the person asked for, when the filter lists them; else Everyone. */
export function pickedPerson(
    asked: string | null | undefined,
    options: TeamOption[],
): string | null {
    return asked && options.some((o) => o.id === asked) ? asked : null;
}

const narrowLayer = (cell: LayerDay, keep: (i: CalendarItem) => boolean) => {
    const items = cell.items.filter(keep);
    const kinds: Record<string, number> = {};
    for (const i of items) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
    // A day's list stops at 50 per layer; past it, the person's count is
    // what the list holds.
    return { count: items.length, kinds, items };
};

/** Each currency's in, out, due and failed, from the entries kept. */
function cellsOf(entries: MoneyEntry[]): MoneyCell[] {
    const by = new Map<string, MoneyCell>();
    for (const e of entries) {
        const c = by.get(e.currency) ?? {
            currency: e.currency,
            in: 0,
            out: 0,
            net: 0,
            due: 0,
            failed: 0,
        };
        c.in += e.in;
        c.out += e.out;
        c.due += e.due;
        c.failed += e.failed;
        c.net = c.in - c.out;
        by.set(e.currency, c);
    }
    return Array.from(by.values());
}

/**
 * The month as one person's: each day's items with them, the counts and
 * kinds those make, and the money on those items. Everyone (null) is the
 * month as sent.
 *
 * What the API adds up on its own side — the day's takings and the month's —
 * can't be split by person, so it is left out rather than shown for the
 * whole team; the money cells, the strip and the day come from the entries
 * on the person's items instead.
 */
export function forPerson(
    month: CalendarMonth,
    staffId: string | null,
): CalendarMonth {
    if (!staffId) return month;
    const kept = new Set<string>();
    const keep = (layer: LayerKey) => (i: CalendarItem) => {
        if (i.staffId !== staffId) return false;
        kept.add(`${layer}:${i.id}`);
        return true;
    };
    const days = month.days.map((day): CalendarDay => {
        const layers: CalendarDay["layers"] = {};
        for (const [key, cell] of Object.entries(day.layers) as [
            LayerKey,
            LayerDay,
        ][]) {
            layers[key] = narrowLayer(cell, keep(key));
        }
        return { date: day.date, layers, toActOn: 0 };
    });
    const totals: CalendarMonth["totals"] = {};
    for (const key of month.layers) {
        totals[key] =
            month.totals[key] === null
                ? null
                : days.reduce((n, d) => n + (d.layers[key]?.count ?? 0), 0);
    }
    const money = month.money
        ? month.money.total === null
            ? month.money
            : (() => {
                  const entries = month.money.entries.filter(
                      (e) =>
                          e.itemId !== null &&
                          kept.has(`${e.layer}:${e.itemId}`),
                  );
                  return { total: cellsOf(entries), entries };
              })()
        : undefined;
    return {
        ...month,
        days,
        totals,
        // Failed renewals and overdue invoices are nobody's on the team.
        toActOn: [],
        ...(month.takings
            ? { takings: { lead: month.takings.lead, total: null } }
            : {}),
        ...(money ? { money } : {}),
    };
}

/**
 * A calendar address: the month (none for this one), the day a key crossed
 * to (E28), and the person picked, so a step to another month keeps them.
 */
export function calendarHref({
    month,
    thisMonth,
    day,
    team,
}: {
    month: string;
    thisMonth: string;
    day?: string;
    team?: string | null;
}): string {
    const q = new URLSearchParams();
    if (month !== thisMonth) q.set("month", month);
    if (day) q.set("day", day);
    if (team) q.set("team", team);
    const s = q.toString();
    return s ? `/calendar?${s}` : "/calendar";
}
