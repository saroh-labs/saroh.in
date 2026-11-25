"use client";

import { Button } from "@saroh/ui/button";
import { ChoiceGroup } from "@saroh/ui/choice-group";
import { Field } from "@saroh/ui/field";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Switch } from "@saroh/ui/switch";
import { Check } from "lucide-react";
import { useId, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { slugify } from "@/lib/products/editor-sections";
import { createPage, duplicatePage } from "@/lib/sites/actions";
import type { ModulePageOffer } from "@/lib/sites/page-menu";
import type {
    CreatePageInput,
    ModulePageKind,
    PageStarter,
    SitePage,
} from "@/lib/sites/service";
import { usePickerFetch } from "@/lib/sites/use-picker";
import type { TeamPickPerson } from "@/lib/staff/team-picker-read";
import { readTeamForPicker } from "@/lib/staff/team-picker-read";

import { TeamPicker } from "./team-picker";

/** What a new page starts from: blank, one ready page, a type, or a copy. */
export type PageStart = "blank" | "copy" | ModulePageKind | PageStarter;

/**
 * The new page types (A7, `fix/WXBAddPage`), each with what it starts
 * with, filled from the business, as the API makes it (`page-starters.ts`).
 */
export const PAGE_TYPES: Record<
    PageStarter,
    { label: string; note: string; name: string; starts: string[] }
> = {
    SERVICE: {
        label: "Service detail",
        note: "Top of the page, what’s included, price, book",
        name: "Service",
        starts: [
            "Top of the page",
            "What’s included",
            "Price, from Services",
            "Book, from Services",
            "Questions",
        ],
    },
    OFFER: {
        label: "Offer",
        note: "Offer, services in it, book",
        name: "Offer",
        starts: ["Top of the page, with Book", "Services in it, from Services"],
    },
    TEAM: {
        label: "Our team",
        note: "Your team: you choose who appears",
        name: "Our team",
        starts: [
            "Top of the page, with Book",
            "Your team: you choose who appears",
        ],
    },
};

const isType = (s: PageStart): s is PageStarter => s in PAGE_TYPES;

/** The four ways to start a page (A7). */
type StartGroup = "blank" | "template" | "ready" | "copy";

/** A start tile, chosen or not. */
const tile = (on: boolean) =>
    cn(
        "grid min-w-0 content-start gap-1 rounded-[10px] border p-2.5 text-left text-sm",
        on ? "border-foreground ring-1 ring-foreground" : "hover:bg-muted",
    );

/**
 * A template page drawn as grey blocks in its order (A7): a picture of its
 * shape, not of any business.
 */
function PageSketch({ type }: { type: PageStarter }) {
    const bar = "block h-1.5 rounded-full bg-muted-foreground/30";
    return (
        <span
            aria-hidden
            className="grid h-16 content-start gap-1 overflow-hidden rounded-md border bg-background p-1.5"
        >
            <span
                className={cn(
                    "block rounded-sm bg-muted",
                    type === "TEAM" ? "h-4" : "h-6",
                )}
            />
            <span className={cn(bar, "w-3/4")} />
            {type === "TEAM" ? (
                <span className="grid grid-cols-3 gap-1">
                    {[0, 1, 2].map((i) => (
                        <span
                            key={i}
                            className="block size-4 rounded-full bg-muted"
                        />
                    ))}
                </span>
            ) : (
                <>
                    <span className={cn(bar, "w-full")} />
                    <span className={cn(bar, "w-1/2")} />
                </>
            )}
        </span>
    );
}
/** A page that takes a name and a link of its own: blank or a type. */
const ownLink = (s: PageStart) => s === "blank" || isType(s);

/**
 * A shorter link for a page (A8): the last word of its own, so "/bridal-
 * trials" becomes "/trials". Null when there is nothing shorter.
 */
export function shorterLink(link: string): string | null {
    const words = link.replace(/^\//, "").split("-").filter(Boolean);
    if (words.length < 2) return null;
    return `/${words[words.length - 1]}`;
}

/** A refusal in the API's words, and the link it offers instead. */
interface Refusal {
    message: string;
    suggestion?: string;
}

/**
 * Add a page (U46e, `fix/WXBAddPage`): its name and link, what it starts
 * from, and whether it shows in the menu. Opens here as a draft page.
 * Today's Add a page in the page picker (`AddPagePanel`) stays as it is.
 *
 * The API decides whether a link is free; a refusal is said in its words
 * and, where it offers another link, the link is put in the field to see
 * before adding (as the picker's panel does).
 */
export function AddPageSheet({
    open,
    siteId,
    address,
    offers,
    page,
    start: initialStart,
    onClose,
    onAdded,
    takenPaths = [],
}: {
    /** The site's pages' links, said as taken while one is typed (A8). */
    takenPaths?: readonly string[];
    open: boolean;
    siteId: string;
    /** "gulmohar.saroh.app", or null before the site has one. */
    address: string | null;
    /** The ready pages this site can add (`addPageOffers`). */
    offers: ModulePageOffer[];
    /** The open page, for "A copy". */
    page: SitePage | undefined;
    start: PageStart;
    onClose: () => void;
    /** A page went in: open it. */
    onAdded: (page: SitePage) => void;
}) {
    const [start, setStart] = useState<PageStart>(initialStart);
    const [title, setTitle] = useState("");
    const [path, setPath] = useState<string | null>(null);
    const [inMenu, setInMenu] = useState(true);
    const [busy, setBusy] = useState(false);
    const [refusal, setRefusal] = useState<Refusal | null>(null);
    const [missing, setMissing] = useState(false);
    // Our team: an owner or admin picks who appears before the page is
    // made (round 3, EBTeamPicker); anyone else gets those already chosen.
    const [picking, setPicking] = useState<TeamPickPerson[] | null>(null);
    const menuId = useId();

    const offer = offers.find((o) => o.kind === start);
    // Our team may go without a name: it is then "Our team" (EBTeamPicker:
    // choosing the tile opens the picker before anything is typed).
    const named =
        title.trim() || (start === "TEAM" ? PAGE_TYPES.TEAM.name : "");
    // The link follows the name until it is typed in.
    const link = path ?? (named ? `/${slugify(named)}` : "");

    // Said as it is typed (A8); the API still decides on Add page.
    const typedLink = link.trim();
    const taken = typedLink !== "" && takenPaths.includes(typedLink);
    const shorter = typedLink ? shorterLink(typedLink) : null;
    const shorten = shorter && !takenPaths.includes(shorter) ? shorter : null;

    // The four ways to start (A7, `fix/WXBAddPage`), then, for a template
    // or ready page, which one.
    const group: StartGroup =
        start === "blank" || start === "copy"
            ? start
            : isType(start)
              ? "template"
              : "ready";
    const groups: { value: StartGroup; label: string; note: string }[] = [
        { value: "blank", label: "Blank", note: "An empty page" },
        {
            value: "template",
            label: "A template page",
            note: (Object.keys(PAGE_TYPES) as PageStarter[])
                .map((t) => PAGE_TYPES[t].label)
                .join(", "),
        },
        ...(offers.length > 0
            ? [
                  {
                      value: "ready" as const,
                      label: "A ready page",
                      note: offers.map((o) => o.label).join(", "),
                  },
              ]
            : []),
        ...(page
            ? [
                  {
                      value: "copy" as const,
                      label: "A copy",
                      note: `Of ${page.title}, hidden and out of the menu`,
                  },
              ]
            : []),
    ];
    const choose = (next: PageStart) => {
        setStart(next);
        setPath(null);
        setRefusal(null);
    };
    const chooseGroup = (g: StartGroup) =>
        choose(
            g === "template"
                ? "SERVICE"
                : g === "ready"
                  ? (offers[0]?.kind ?? "blank")
                  : g,
        );

    // The team picker's cached read (U18), else asked now.
    const fetchTeam = usePickerFetch("team", readTeamForPicker);
    /** Opens Add people when this person may choose; says whether it did. */
    async function pickTeam(): Promise<boolean> {
        setBusy(true);
        const read = await fetchTeam().catch(() => null);
        setBusy(false);
        if (read?.canChoose && read.team && read.team.length > 0) {
            setPicking(read.team);
            return true;
        }
        return false;
    }

    async function add(picked = false) {
        setRefusal(null);
        if (start === "TEAM" && !picked) {
            if (link.trim() === "") {
                setMissing(true);
                return;
            }
            if (await pickTeam().catch(() => false)) return;
        }
        let res;
        if (start === "copy") {
            if (!page) return;
            res = await runAction(() => duplicatePage(siteId, page.id), {
                setBusy,
            });
        } else {
            let input: CreatePageInput;
            if (ownLink(start)) {
                const t = named;
                if (t === "" || link.trim() === "") {
                    setMissing(true);
                    return;
                }
                input = {
                    title: t,
                    path: link.trim(),
                    inMenu,
                    ...(isType(start) ? { starter: start } : {}),
                };
            } else {
                input = {
                    kind: start,
                    ...(title.trim() ? { title: title.trim() } : {}),
                    // Only once the API offered another link for it.
                    ...(path ? { path } : {}),
                    inMenu,
                };
            }
            res = await runAction(() => createPage(siteId, input), {
                setBusy,
            });
        }
        if (!res) return;
        if (res.ok) {
            onAdded(res.data);
            return;
        }
        setRefusal({ message: res.error, suggestion: res.suggestion });
    }

    if (picking) {
        return (
            <TeamPicker
                team={picking}
                onClose={() => setPicking(null)}
                onSaved={() => {
                    setPicking(null);
                    void add(true);
                }}
            />
        );
    }

    return (
        <FormSheet
            open={open}
            title="Add a page"
            description="Opens here as a draft page. Nothing is live until you publish."
            pending={busy}
            saveLabel="Add page"
            savingLabel="Adding…"
            bottomOnPhone
            dirty
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                void add();
            }}
        >
            <div className="grid gap-5">
                {start === "copy" ? null : (
                    <>
                        <Field
                            label="Page name"
                            optional={!ownLink(start) || start === "TEAM"}
                            error={
                                missing && ownLink(start) && !named
                                    ? "Give the page a name."
                                    : undefined
                            }
                        >
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={
                                    isType(start)
                                        ? PAGE_TYPES[start].name
                                        : (offer?.label ?? "Our team")
                                }
                            />
                        </Field>
                        <Field
                            holdsData
                            label="Page link"
                            hint={
                                !ownLink(start) ? (
                                    `${offer?.path ?? ""} · this page's own link`
                                ) : typedLink === "" ? (
                                    "Made from the name. Change it if you like."
                                ) : (
                                    // Free: green with a tick (A7, `WXBAddPage`).
                                    <span
                                        data-link-free={!taken}
                                        className={
                                            taken
                                                ? undefined
                                                : "inline-flex items-center gap-1 text-success-subtle-foreground"
                                        }
                                    >
                                        {taken ? null : (
                                            <Check
                                                aria-hidden
                                                className="size-3.5 shrink-0"
                                            />
                                        )}
                                        {taken
                                            ? `Another page uses ${typedLink}. Change it, or Shorten.`
                                            : `Nobody else uses it.${shorten ? ` Shorten makes it ${shorten}.` : ""}`}
                                    </span>
                                )
                            }
                        >
                            {/* The address and the whole link in one field
                                (A7): the address gives way, never the link. */}
                            <div className="flex min-w-0 items-center gap-1 rounded-md border bg-background pl-3 pr-1 focus-within:ring-2 focus-within:ring-ring">
                                {address ? (
                                    <span className="min-w-0 shrink truncate font-mono text-sm text-muted-foreground">
                                        {address}
                                    </span>
                                ) : null}
                                <Input
                                    // As wide as the link, so the address
                                    // truncates first (A7 · 2).
                                    className="w-auto min-w-[9rem] max-w-full shrink-0 grow border-0 bg-transparent px-0 font-mono shadow-none [field-sizing:content] focus-visible:ring-0"
                                    value={
                                        ownLink(start)
                                            ? link
                                            : (path ?? offer?.path ?? "")
                                    }
                                    disabled={!ownLink(start)}
                                    onChange={(e) => setPath(e.target.value)}
                                    aria-label="Page link"
                                    placeholder="/our-team"
                                />
                                {ownLink(start) && shorten ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        className="shrink-0"
                                        onClick={() => setPath(shorten)}
                                    >
                                        Shorten
                                    </Button>
                                ) : null}
                            </div>
                        </Field>
                    </>
                )}

                <ChoiceGroup
                    label="Start from"
                    className="grid grid-cols-2 gap-2"
                    choices={groups.map((g) => ({
                        value: g.value,
                        label: (
                            <>
                                <span className="font-semibold">{g.label}</span>
                                <span className="line-clamp-2 text-xs text-muted-foreground">
                                    {g.note}
                                </span>
                            </>
                        ),
                    }))}
                    value={group}
                    onChange={chooseGroup}
                    itemClassName={tile}
                />

                {group === "template" ? (
                    // Each with a small picture of its page (A7).
                    <ChoiceGroup
                        label="Template pages"
                        className="grid grid-cols-3 gap-2"
                        choices={(Object.keys(PAGE_TYPES) as PageStarter[]).map(
                            (t) => ({
                                value: t,
                                label: (
                                    <>
                                        <PageSketch type={t} />
                                        <span className="text-[0.8125rem] font-semibold">
                                            {PAGE_TYPES[t].label}
                                        </span>
                                        <span className="line-clamp-2 text-xs text-muted-foreground">
                                            {PAGE_TYPES[t].note}
                                        </span>
                                    </>
                                ),
                            }),
                        )}
                        value={isType(start) ? start : null}
                        onChange={(t) => {
                            choose(t);
                            // Choosing Our team opens the picker (EBTeamPicker).
                            if (t === "TEAM") void pickTeam();
                        }}
                        itemClassName={tile}
                    />
                ) : group === "ready" ? (
                    <ChoiceGroup
                        label="Ready pages"
                        className="flex flex-wrap gap-1.5"
                        choices={offers.map((o) => ({
                            value: o.kind,
                            label: o.label,
                        }))}
                        value={start}
                        onChange={choose}
                        itemClassName={(on) =>
                            cn(
                                "min-h-9 rounded-full border px-3 text-[0.8125rem] coarse:min-h-11",
                                on
                                    ? "border-foreground ring-1 ring-foreground"
                                    : "hover:bg-muted",
                            )
                        }
                    />
                ) : null}

                {isType(start) ? (
                    <section
                        aria-labelledby={`${menuId}-starts`}
                        className="grid gap-1.5 rounded-[10px] border bg-card p-3"
                        data-page-type-starts={start}
                    >
                        <h3
                            id={`${menuId}-starts`}
                            className="text-xs font-semibold text-muted-foreground"
                        >
                            Starts with, filled from your business
                        </h3>
                        {/* As chips, in the page's order (A7). */}
                        <ol className="flex flex-wrap gap-1.5 text-[0.8125rem]">
                            {PAGE_TYPES[start].starts.map((line) => (
                                <li
                                    key={line}
                                    className="rounded-full border bg-background px-2.5 py-0.5"
                                >
                                    {line}
                                </li>
                            ))}
                        </ol>
                        <p className="text-xs text-muted-foreground">
                            Sample words are swapped for your details. Change
                            anything once it opens.
                        </p>
                    </section>
                ) : null}

                {start === "copy" ? null : (
                    <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={menuId}>Show in the menu</Label>
                        <Switch
                            id={menuId}
                            checked={inMenu}
                            onCheckedChange={setInMenu}
                        />
                    </div>
                )}

                {refusal ? (
                    <Notice
                        tone="error"
                        action={
                            refusal.suggestion && start !== "copy" ? (
                                <Button
                                    data-ph-mask=""
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={() => {
                                        // Put in the field to see first;
                                        // Add page then sends it.
                                        setPath(refusal.suggestion ?? null);
                                        setRefusal(null);
                                    }}
                                >
                                    Use {refusal.suggestion}
                                </Button>
                            ) : undefined
                        }
                    >
                        {refusal.message}
                    </Notice>
                ) : null}
            </div>
        </FormSheet>
    );
}
