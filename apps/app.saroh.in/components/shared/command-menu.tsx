"use client";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import {
    CalendarPlus,
    CircleHelp,
    Globe,
    Receipt,
    Store,
    Target,
    UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { HelpTopic } from "@/lib/help/links";
import { HELP_TOPICS, helpUrl } from "@/lib/help/links";
import type { SearchHit, SearchKind } from "@/lib/search/service";

import { NAV_GROUPS, filterNavGroups, navGroupsWithSites } from "./nav-items";

const OPEN_EVENT = "saroh:open-command";

/** Open the command palette from anywhere (e.g. the top-bar search button). */
export function openCommandMenu() {
    window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Long enough that a keystroke burst is one request, short enough that the
 * results feel attached to the typing.
 */
const DEBOUNCE_MS = 180;

const KIND_META: Record<
    SearchKind,
    { icon: typeof UserRound; heading: string }
> = {
    contact: { icon: UserRound, heading: "Contacts" },
    lead: { icon: Target, heading: "Leads" },
    order: { icon: Receipt, heading: "Orders" },
};

const KIND_ORDER: SearchKind[] = ["contact", "lead", "order"];

/**
 * Help articles, reachable from the same box as everything else.
 *
 * Someone who does not know how bookings work does not know to look under
 * Bookings — they know the word "booking". Putting the articles here means the
 * question they can actually phrase reaches the answer, instead of requiring
 * them to already know the shape of the product.
 *
 * Labels carry the plain word first ("Booking", "Payment") because that is what
 * gets typed, not our section names.
 */
const HELP_ITEMS: { label: string; topic: HelpTopic }[] = [
    { label: "Help: getting started", topic: HELP_TOPICS.gettingStarted },
    {
        label: "Help: search, filters and views",
        topic: HELP_TOPICS.findingYourWay,
    },
    {
        label: "Help: contacts, leads and customers",
        topic: HELP_TOPICS.customers,
    },
    { label: "Help: selling, products and orders", topic: HELP_TOPICS.selling },
    {
        label: "Help: bookings, services and availability",
        topic: HELP_TOPICS.bookings,
    },
    {
        label: "Help: your website and enquiry forms",
        topic: HELP_TOPICS.website,
    },
    {
        label: "Help: your team, roles and providers",
        topic: HELP_TOPICS.organisation,
    },
    {
        label: "Help: turning capabilities on and off",
        topic: HELP_TOPICS.capabilities,
    },
];

/**
 * Things you can DO, not just places you can go. Each is gated on the module
 * that owns it, so a merchant without Commerce is never offered "New store".
 *
 * ONLY ROUTES THAT EXIST. "New lead" belongs on this list by every argument
 * except the one that counts — there is no `/leads/new`; a lead is created from
 * a contact. Adding it would have rebuilt the exact defect this audit opened
 * with: a confident call to action that terminates in "Page not found".
 * `pnpm check:routes` fails the build on these, and it is checked here.
 */
const ACTIONS: {
    href: string;
    label: string;
    icon: typeof UserRound;
    moduleKey?: string;
}[] = [
    {
        href: "/services/new",
        label: "New service",
        icon: CalendarPlus,
        moduleKey: "APPOINTMENTS",
    },
    {
        href: "/sites/new",
        label: "New site",
        icon: Globe,
        moduleKey: "WEBSITE",
    },
    {
        href: "/stores/new",
        label: "New store",
        icon: Store,
        moduleKey: "COMMERCE",
    },
];

/**
 * Global ⌘K / Ctrl-K command palette.
 *
 * ## What changed, and why it was worth changing
 *
 * This shipped mapping `NAV_GROUPS` and nothing else — so it contained exactly
 * the fifteen links already visible in the rail, while its placeholder promised
 * "Search or jump to…". Typing a customer's name returned "No results found".
 * The audit called it a decoy and scored the efficiency heuristic 1/10 on it,
 * which is right: a search box that cannot find the thing you are looking at is
 * worse than none, because it also spends the belief that searching is possible.
 *
 * It now does three things, in the order a hurried person wants them: the
 * entities matching what they typed, the actions they might be trying to start,
 * and the destinations they might be trying to reach.
 *
 * `shouldFilter={false}` on the dialog is load-bearing. cmdk's built-in fuzzy
 * filter runs over the rendered item `value`s, which would then re-filter server
 * results that already matched — hiding a contact the API returned because the
 * client's idea of "matches" is narrower. The server decides what matched; this
 * only decides what to draw.
 */
export function CommandMenu({
    moduleKeys = null,
    sites = [],
}: {
    moduleKeys?: string[] | null;
    /**
     * The merchant's own sites. They join the nav results, so a site is
     * reachable by typing its name — which is the payoff for putting the tree
     * in `NAV_GROUPS` rather than in the sidebar alone.
     */
    sites?: { id: string; name: string }[];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<SearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const groups = filterNavGroups(
        navGroupsWithSites(NAV_GROUPS, sites),
        moduleKeys,
    );

    const available = moduleKeys === null ? null : new Set(moduleKeys);
    const actions = ACTIONS.filter(
        (a) => !a.moduleKey || !available || available.has(a.moduleKey),
    );

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        const onOpen = () => setOpen(true);
        document.addEventListener("keydown", onKey);
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => {
            document.removeEventListener("keydown", onKey);
            window.removeEventListener(OPEN_EVENT, onOpen);
        };
    }, []);

    /*
     * One in-flight request at a time, and late replies are discarded.
     *
     * Without the generation counter, typing "ana" then "ananya" can render the
     * results for "ana" if that response lands second — the palette would show
     * matches for a query the merchant has already finished replacing.
     */
    const generation = useRef(0);

    useEffect(() => {
        const trimmed = query.trim();
        // Nothing is SET here for a too-short query — the "no results yet" state
        // is derived below from `query` itself. Clearing state synchronously in
        // an effect body is a cascading render, and the value it would write is
        // already implied by the input.
        if (trimmed.length < 2) return;

        const mine = ++generation.current;
        const timer = setTimeout(() => {
            setSearching(true);
            void fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
                .then((r) => (r.ok ? r.json() : { hits: [] }))
                .then((data: { hits?: SearchHit[] }) => {
                    if (mine !== generation.current) return;
                    setHits(data.hits ?? []);
                })
                .catch(() => {
                    // A failed search is an empty search, not a broken palette.
                    if (mine === generation.current) setHits([]);
                })
                .finally(() => {
                    if (mine === generation.current) setSearching(false);
                });
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [query]);

    const go = (href: string) => {
        setOpen(false);
        setQuery("");
        setHits([]);
        router.push(href);
    };

    const typed = query.trim().length >= 2;
    /*
     * Derived, not stored. `hits` only ever holds the last SUCCESSFUL response,
     * so a query the merchant has shortened back below the threshold shows
     * nothing without an effect having to reach in and clear it — and the
     * results of an abandoned query can never flash back.
     */
    const shown = typed ? hits : [];
    const busy = typed && searching;
    const byKind = KIND_ORDER.map((kind) => ({
        kind,
        rows: shown.filter((h) => h.kind === kind),
    })).filter((g) => g.rows.length > 0);

    // Navigation and actions are filtered here because cmdk's own filter is off.
    const needle = query.trim().toLowerCase();
    const matches = (label: string) =>
        !needle || label.toLowerCase().includes(needle);
    const visibleActions = actions.filter((a) => matches(a.label));
    // Only once something is typed: eight help rows in an empty palette would
    // bury the navigation it is mostly used for.
    const visibleHelp = needle
        ? HELP_ITEMS.filter((h) => matches(h.label))
        : [];

    return (
        <CommandDialog
            label="Search the workspace"
            description="Find a contact, lead or order, start something new, or jump to a section."
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setQuery("");
            }}
            shouldFilter={false}
        >
            <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Search contacts, leads and orders…"
            />
            <CommandList>
                <CommandEmpty>
                    {/* Three different states, because they call for three
                        different responses from the person reading them. */}
                    {!typed
                        ? "Type at least two characters to search."
                        : busy
                          ? "Searching…"
                          : `Nothing matches “${query.trim()}”.`}
                </CommandEmpty>

                {byKind.map(({ kind, rows }) => {
                    const Icon = KIND_META[kind].icon;
                    return (
                        <CommandGroup
                            key={kind}
                            heading={KIND_META[kind].heading}
                        >
                            {rows.map((hit) => (
                                <CommandItem
                                    key={`${hit.kind}:${hit.id}`}
                                    value={`${hit.kind}:${hit.id}`}
                                    onSelect={() => go(hit.href)}
                                >
                                    <Icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                    <span className="truncate">
                                        {hit.title}
                                    </span>
                                    {hit.subtitle ? (
                                        <span className="ml-2 truncate text-xs text-muted-foreground">
                                            {hit.subtitle}
                                        </span>
                                    ) : null}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    );
                })}

                {visibleActions.length > 0 ? (
                    <CommandGroup heading="Create">
                        {visibleActions.map((action) => {
                            const Icon = action.icon;
                            return (
                                <CommandItem
                                    key={action.href}
                                    value={action.href}
                                    onSelect={() => go(action.href)}
                                >
                                    <Icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                    {action.label}
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                ) : null}

                {groups.map((group, i) => {
                    // Matched on the group's name as well as the item's.
                    // Someone looking for their calendar types "booking", not
                    // "Schedule" — the section is called Bookings and the item
                    // inside it is not, so filtering on the item alone made the
                    // most obvious search term miss its own section.
                    const groupMatches = group.label
                        ? matches(group.label)
                        : false;
                    const items = group.items.filter(
                        (item) => groupMatches || matches(item.label),
                    );
                    if (items.length === 0) return null;
                    return (
                        <CommandGroup key={i} heading={group.label ?? "Go to"}>
                            {items.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <CommandItem
                                        key={item.href}
                                        value={item.href}
                                        onSelect={() => go(item.href)}
                                    >
                                        <Icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                        {item.label}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    );
                })}
                {/*
                 * The merchant's own things, flattened out of the tree the
                 * rail draws (#212). This menu read `group.items` alone, so
                 * a site was never reachable here by name however it appeared
                 * in the rail — the claim that it was, made when the tree
                 * landed, was wrong until this block existed.
                 */}
                {(() => {
                    const leaves: { label: string; href: string }[] = [];
                    for (const group of groups) {
                        for (const item of group.items) {
                            for (const child of item.children ?? []) {
                                if (child.href) {
                                    leaves.push({
                                        label: child.label,
                                        href: child.href,
                                    });
                                    continue;
                                }
                                for (const leaf of child.children ?? []) {
                                    if (!leaf.href) continue;
                                    leaves.push({
                                        // "Northwind Supply · Settings": the
                                        // site is the thing searched for, the
                                        // screen is where it lands.
                                        label: `${child.label} · ${leaf.label}`,
                                        href: leaf.href,
                                    });
                                }
                            }
                        }
                    }
                    const hits = leaves.filter((l) => matches(l.label));
                    if (hits.length === 0) return null;
                    return (
                        <CommandGroup heading="Your sites">
                            {hits.map((leaf) => (
                                <CommandItem
                                    key={leaf.href}
                                    value={leaf.href}
                                    onSelect={() => go(leaf.href)}
                                >
                                    <Globe className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                    {leaf.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    );
                })()}
                {visibleHelp.length > 0 ? (
                    <CommandGroup heading="Help">
                        {visibleHelp.map((item) => (
                            <CommandItem
                                key={item.topic}
                                value={item.topic}
                                onSelect={() => {
                                    setOpen(false);
                                    setQuery("");
                                    // A new tab, so reading an answer never
                                    // costs the merchant the screen they were
                                    // stuck on.
                                    window.open(
                                        helpUrl(item.topic),
                                        "_blank",
                                        "noopener,noreferrer",
                                    );
                                }}
                            >
                                <CircleHelp className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                {item.label}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                ) : null}
            </CommandList>
        </CommandDialog>
    );
}
