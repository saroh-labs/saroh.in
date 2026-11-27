/**
 * What a lead is about, without the person's name (DEC-277). A form's lead
 * is titled "‹name› — ‹form›" (`enquiry.service.ts`), and the name is
 * already the row's and the page's heading; the rest is the subject. A
 * title that doesn't start with the name is the subject as it is.
 */
export function leadSubject(title: string, name: string | null): string {
    const t = title.trim();
    if (!name) return t;
    for (const sep of [" — ", " - ", ": "]) {
        const head = `${name}${sep}`;
        if (t.toLowerCase().startsWith(head.toLowerCase())) {
            return t.slice(head.length).trim() || t;
        }
    }
    return t === name ? "" : t;
}

/** The soonest open follow-up per lead, from the open tasks (soonest first). */
export function nextFollowUps(
    tasks: { leadId: string; dueAt: string | null }[] | null,
): Map<string, string> {
    const out = new Map<string, string>();
    for (const t of tasks ?? []) {
        if (!t.dueAt) continue;
        const had = out.get(t.leadId);
        if (!had || t.dueAt < had) out.set(t.leadId, t.dueAt);
    }
    return out;
}
