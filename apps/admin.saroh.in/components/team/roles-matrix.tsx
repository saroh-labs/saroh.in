"use client";

import { Label } from "@saroh/ui/label";
import { ScrollX } from "@saroh/ui/scroll-x";
import { Switch } from "@saroh/ui/switch";
import { useId, useState } from "react";

import type { AdminRole } from "@/lib/control-plane";
import { ROLE_LABEL, ROLE_PURPOSE } from "@/lib/roles";
import type { MatrixCell, RolesMatrix } from "@/lib/roles-matrix";
import { cellLabel, cellWords, holdersWords } from "@/lib/roles-matrix";

const TONE: Record<MatrixCell["level"], string> = {
    change: "font-semibold text-success-subtle-foreground",
    see: "text-foreground",
    none: "text-muted-foreground",
};

/**
 * Console roles (R31, admin console U17): each role with what it is for
 * and how many people hold it, then a Change / See / — table of every
 * permission in plain words, grouped by area. Show permission codes adds
 * each row's codes as small text under its words; the words are always
 * the label.
 *
 * On a wide screen it is one table (it scrolls inside its box if the
 * window is narrower than the roles); on a phone it is one role at a
 * time, picked above the list, so nothing scrolls sideways.
 */
export function RolesMatrixView({
    matrix,
    holders,
}: {
    matrix: RolesMatrix;
    /** How many people hold each role now; absent when unknown. */
    holders: Partial<Record<AdminRole, number>>;
}) {
    const switchId = useId();
    const [codes, setCodes] = useState(false);
    const [role, setRole] = useState<AdminRole>(
        matrix.roles[0] ?? "PLATFORM_OWNER",
    );

    return (
        <div className="grid gap-4">
            <p className="max-w-[68ch] text-sm text-muted-foreground">
                Roles and what they may do are part of Saroh&rsquo;s code, the
                same everywhere Saroh runs. Who holds them is decided on
                Teammates.
            </p>

            <ul aria-label="Roles" className="grid gap-2 sm:grid-cols-2">
                {matrix.roles.map((r) => (
                    <li key={r} className="rounded-lg border bg-card p-3">
                        <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                            <span className="font-medium">{ROLE_LABEL[r]}</span>
                            {holders[r] !== undefined && (
                                <span className="text-[13px] text-muted-foreground">
                                    {holdersWords(holders[r] ?? 0)}
                                </span>
                            )}
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                            {ROLE_PURPOSE[r]}
                        </p>
                    </li>
                ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-muted-foreground">
                    <strong className="font-semibold text-foreground">
                        Change
                    </strong>{" "}
                    can act ·{" "}
                    <strong className="font-semibold text-foreground">
                        See
                    </strong>{" "}
                    read only · — can&rsquo;t
                </p>
                <div className="flex items-center gap-2">
                    <Switch
                        id={switchId}
                        size="sm"
                        checked={codes}
                        onCheckedChange={setCodes}
                    />
                    <Label htmlFor={switchId} className="text-[13px]">
                        Show permission codes
                    </Label>
                </div>
            </div>

            {/* Wide screens: the whole table. */}
            <div className="hidden md:block">
                <ScrollX label="What each role may do">
                    <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-[13px]">
                        <caption className="sr-only">
                            What each console role may do
                        </caption>
                        <thead>
                            <tr>
                                <th
                                    scope="col"
                                    className="border-b p-2 text-left font-medium text-muted-foreground"
                                >
                                    What
                                </th>
                                {matrix.roles.map((r) => (
                                    <th
                                        key={r}
                                        scope="col"
                                        className="border-b p-2 text-left font-semibold"
                                    >
                                        {ROLE_LABEL[r]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        {matrix.areas.map((area) => (
                            <tbody key={area.name}>
                                <tr>
                                    <th
                                        scope="colgroup"
                                        colSpan={matrix.roles.length + 1}
                                        className="border-b bg-muted/40 p-2 text-left text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
                                    >
                                        {area.name}
                                    </th>
                                </tr>
                                {area.rows.map((row) => (
                                    <tr key={row.key} data-row={row.key}>
                                        <th
                                            scope="row"
                                            className="border-b p-2 text-left font-normal"
                                        >
                                            <span>{row.label}</span>
                                            {codes && (
                                                <span className="block font-mono text-[11px] text-muted-foreground">
                                                    {row.codes.join(" · ")}
                                                </span>
                                            )}
                                        </th>
                                        {matrix.roles.map((r) => {
                                            const cell = row.cells[r] ?? {
                                                level: "none" as const,
                                                own: false,
                                            };
                                            return (
                                                <td
                                                    key={r}
                                                    className={`border-b p-2 ${TONE[cell.level]}`}
                                                >
                                                    <span aria-hidden="true">
                                                        {cellWords(cell)}
                                                    </span>
                                                    <span className="sr-only">
                                                        {cellLabel(cell)}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        ))}
                    </table>
                </ScrollX>
            </div>

            {/* Phones: one role at a time. */}
            <div className="grid gap-3 md:hidden">
                <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">
                        Show what this role may do
                    </span>
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as AdminRole)}
                        className="h-11 w-full rounded-md border border-input bg-field px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {matrix.roles.map((r) => (
                            <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                            </option>
                        ))}
                    </select>
                </label>
                {matrix.areas.map((area) => (
                    <section key={area.name} className="grid gap-1">
                        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {area.name}
                        </h3>
                        <ul className="grid rounded-lg border bg-card">
                            {area.rows.map((row) => {
                                const cell = row.cells[role] ?? {
                                    level: "none" as const,
                                    own: false,
                                };
                                return (
                                    <li
                                        key={row.key}
                                        className="flex items-start justify-between gap-3 border-b p-3 text-[13px] last:border-0"
                                    >
                                        <span className="min-w-0">
                                            {row.label}
                                            {codes && (
                                                <span className="block break-all font-mono text-[11px] text-muted-foreground">
                                                    {row.codes.join(" · ")}
                                                </span>
                                            )}
                                        </span>
                                        <span
                                            className={`shrink-0 ${TONE[cell.level]}`}
                                        >
                                            {cellWords(cell)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}
