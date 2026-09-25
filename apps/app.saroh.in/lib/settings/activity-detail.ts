import type {
    AuditEventRow,
    ChangeValue,
    RecordedChange,
    RoleLabels,
} from "./activity";
import {
    FIELD_PHRASES,
    fieldsOf,
    moduleName,
    personName,
    record,
    recordedChanges,
    roleName,
    text,
} from "./activity";

/**
 * The sheet a Settings › Activity row opens (#509): when, to the minute and
 * in the business's time zone; who, with their email and their role now;
 * and every field the change touched — before and after where the stream
 * kept them, "changed" where it kept only the name (a save from before
 * values were recorded, or the contact email and website, which never
 * carry one).
 *
 * Pure, beside `activity.ts`, which says the same events as one line.
 */
/** One thing that changed, as the sheet lists it. */
export interface ActivityChangeRow {
    label: string;
    /** "INV → RC", "Added", or "Changed" when no value was kept. */
    before: string | null;
    after: string | null;
}

export interface ActivityDetail {
    /** "Thursday 25 September 2026, 13:47 IST", in the business's zone. */
    when: string;
    who: {
        name: string;
        /** Their email, when it is not already the name. */
        email: string | null;
        /** Their role here now; null when they are no longer on the team. */
        role: string | null;
        gone: boolean;
    };
    /** Every field, each with before and after when they were kept. */
    changes: ActivityChangeRow[];
    /** True for a save from before values were kept (#509). */
    withoutValues: boolean;
}

/** How the sheet shows a recorded value. */
function shown(field: string, value: ChangeValue): string {
    if (value === null) return "Not set";
    if (field === "gstRegistered") {
        return value === true ? "Registered" : "Not registered";
    }
    if (typeof value === "boolean") return value ? "On" : "Off";
    return String(value);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const row = (
    label: string,
    before: string | null,
    after: string | null,
): ActivityChangeRow => ({ label, before, after });

/** A settings save's fields: with values where kept, "changed" where not. */
function profileRows(
    fields: readonly string[],
    changes: readonly RecordedChange[] | null,
): ActivityChangeRow[] {
    const rows: ActivityChangeRow[] = [];
    const seen = new Set<string>();
    for (const change of changes ?? []) {
        const label = FIELD_PHRASES[change.field]?.label ?? "Another detail";
        seen.add(label);
        rows.push(
            change.field === "logo"
                ? // "Added", "Changed", "Removed": what happened, not where.
                  row(label, null, capitalise(shown("logo", change.after)))
                : row(
                      label,
                      shown(change.field, change.before),
                      shown(change.field, change.after),
                  ),
        );
    }
    for (const field of fields) {
        const label = FIELD_PHRASES[field]?.label ?? "Another detail";
        if (seen.has(label)) continue;
        seen.add(label);
        rows.push(row(label, null, null));
    }
    return rows;
}

function detailRows(
    event: AuditEventRow,
    roleLabels: RoleLabels,
): { rows: ActivityChangeRow[]; withoutValues: boolean } {
    const meta = record(event.metadata);
    const role = (key: unknown) => roleName(key, roleLabels);
    switch (event.action) {
        case "profile.update": {
            const changes = recordedChanges(meta);
            return {
                rows: profileRows(fieldsOf(meta), changes),
                withoutValues: changes === null,
            };
        }
        case "storefront.hours.update": {
            const changes = recordedChanges(meta) ?? [];
            const where = text(meta.storefront);
            return {
                rows: changes.map((c) =>
                    row(
                        where ? `Opening hours, ${where}` : "Opening hours",
                        shown(c.field, c.before),
                        shown(c.field, c.after),
                    ),
                ),
                withoutValues: false,
            };
        }
        case "organization.module.enabled":
        case "organization.module.disabled": {
            const on = event.action === "organization.module.enabled";
            return {
                rows: [
                    row(
                        moduleName(meta, event.targetId),
                        on ? "Off" : "On",
                        on ? "On" : "Off",
                    ),
                ],
                withoutValues: false,
            };
        }
        case "organization.plan.changed":
            return {
                rows: [row("Plan", text(meta.from) ?? "None", text(meta.to))],
                withoutValues: false,
            };
        case "membership.invite":
            return {
                rows: [
                    ...(event.target
                        ? [row("Invited", null, event.target.email)]
                        : []),
                    ...(role(meta.role)
                        ? [row("Role", null, role(meta.role))]
                        : []),
                ],
                withoutValues: false,
            };
        case "membership.accept":
            return {
                rows: role(meta.role)
                    ? [row("Role", null, role(meta.role))]
                    : [],
                withoutValues: false,
            };
        case "membership.role.update":
            return {
                rows: [row("Role", role(meta.from), role(meta.to))],
                withoutValues: false,
            };
        case "membership.remove":
            return {
                rows: [row("Role", role(meta.role), "Removed from the team")],
                withoutValues: false,
            };
        default:
            return { rows: [], withoutValues: false };
    }
}

/**
 * Everything the sheet shows for one event: when to the minute in the
 * business's time zone, who with their email and role now, and every field
 * that changed.
 */
export function activityDetail(
    event: AuditEventRow,
    timeZone: string,
    roleLabels: RoleLabels = {},
): ActivityDetail {
    const actor = event.actor;
    const name = personName(actor);
    const { rows, withoutValues } = detailRows(event, roleLabels);
    return {
        when: formatFullMoment(event.createdAt, timeZone),
        who: {
            name: name ?? "Someone no longer here",
            email: actor && actor.email !== name ? actor.email : null,
            role: roleName(actor?.role, roleLabels),
            // An older API sends no role at all: that is not having left;
            // nor is Saroh support, which was never on the team.
            gone: !actor || (actor.role === null && !actor.operator),
        },
        changes: rows,
        withoutValues,
    };
}

/**
 * The zone as a person knows it: "IST", "BST", "EDT", else "GMT+4". ICU
 * names a zone in some locales and not others, so each is asked in turn.
 */
function zoneName(at: Date, timeZone: string): string {
    let fallback = "";
    for (const locale of ["en-IN", "en-GB", "en-US"]) {
        const name = new Intl.DateTimeFormat(locale, {
            timeZone,
            timeZoneName: "short",
        })
            .formatToParts(at)
            .find((p) => p.type === "timeZoneName")?.value;
        if (!name) continue;
        if (!/^(GMT|UTC)/.test(name)) return name;
        fallback ||= name;
    }
    return fallback;
}

/** "Thursday 25 September 2026, 13:47 IST": to the minute, in the zone. */
export function formatFullMoment(iso: string, timeZone: string): string {
    const at = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(at);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === type)?.value ?? "";
    const zone = zoneName(at, timeZone);
    return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")}${zone ? ` ${zone}` : ""}`;
}
