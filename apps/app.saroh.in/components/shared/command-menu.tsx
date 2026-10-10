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
    CalendarCheck,
    CalendarClock,
    CircleHelp,
    Clock,
    Globe,
    Package,
    Receipt,
    ReceiptText,
    Repeat,
    RotateCw,
    SlidersHorizontal,
    Target,
    UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { StorefrontAllowance } from "@/lib/business-limits";
import type { HelpTopic } from "@/lib/help/links";
import {
    HELP_ARTICLES,
    HELP_TOPICS,
    helpArticleUrl,
    helpHasMoved,
    helpHomeUrl,
    helpUrl,
} from "@/lib/help/links";
import { mayNavigate } from "@/lib/nav/leave-request";
import type { Recent } from "@/lib/search/recents";
import { readRecents, rememberRecent } from "@/lib/search/recents";
import type { SearchHit, SearchKind } from "@/lib/search/service";
import { searchSettings, settingsPageLabel } from "@/lib/settings/search";
import { noMatchLine } from "@saroh/ui/lib/state-copy";

import type { NavRole } from "./nav-items";
import {
    NOTIFICATIONS_NAV,
    WEBSITE_HREF,
    navCan,
    navFor,
    settingsPagesFor,
} from "./nav-items";
import { quickActionsFor } from "./quick-actions";

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
    // One person backs both screens (DEC-041), so one group finds them.
    contact: { icon: UserRound, heading: "Customers and contacts" },
    order: { icon: Receipt, heading: "Orders" },
    booking: { icon: CalendarCheck, heading: "Bookings" },
    product: { icon: Package, heading: "Products" },
    invoice: { icon: ReceiptText, heading: "Invoices" },
    service: { icon: CalendarClock, heading: "Services" },
    subscription: { icon: Repeat, heading: "Subscriptions" },
    lead: { icon: Target, heading: "Leads" },
};

/** The order the groups are drawn in: who, then what they did. */
const KIND_ORDER: SearchKind[] = [
    "contact",
    "order",
    "booking",
    "product",
    "invoice",
    "service",
    "subscription",
    "lead",
];

/** Said when the search itself couldn't be read. Never "Nothing matches". */
export const SEARCH_FAILED = "Search isn't answering. Try again.";

/** A recent's icon, by the kind it was found as. */
function recentIcon(kind: string): typeof UserRound {
    return kind in KIND_META ? KIND_META[kind as SearchKind].icon : Clock;
}

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
const OLD_HELP_ITEMS: { label: string; topic: HelpTopic }[] = [
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
 * The help rows, worked out when the palette is searched. Until Help moves to
 * saroh.in (17 Oct) they are the old site's topics; from then on, one row per
 * article, so typing "deposit" or "GSTIN" finds the page that answers it, and
 * a last row for every article.
 */
function helpItems(now: Date): { key: string; label: string; href: string }[] {
    if (!helpHasMoved(now)) {
        return OLD_HELP_ITEMS.map((h) => ({
            key: h.topic,
            label: h.label,
            href: helpUrl(h.topic, now),
        }));
    }
    return [
        ...HELP_ARTICLES.map((a) => ({
            key: a.slug,
            label: `Help: ${a.title.charAt(0).toLowerCase()}${a.title.slice(1)}`,
            href: helpArticleUrl(a.slug),
        })),
        { key: "all", label: "Help: all articles", href: helpHomeUrl(now) },
    ];
}

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
    role = null,
    // Renamed on the way in: this file already has an `actions` of its own,
    // the quick actions the palette offers.
    actions: permissions = null,
    sites = [],
    storefronts = null,
    stockTracked = null,
    roleKey = null,
    kind,
    recentsScope = "",
}: {
    moduleKeys?: string[] | null;
    /**
     * Whose recents these are: the open business's id. What someone opened
     * in one business is not offered in another.
     */
    recentsScope?: string;
    /**
     * What is being set up (DEC-070): the Business settings page is "Your
     * details" for Just me and A site for my work.
     */
    kind?: string;
    /** The role as stored; see `navFor`. */
    roleKey?: string | null;
    /** The actor's role here; `null` = unknown, and the palette fails open. */
    role?: NavRole | null;
    /**
     * What the actor may do, resolved by the API. Search offers the same
     * destinations the rail does, so it has to judge them the same way.
     */
    actions?: readonly string[] | null;
    /**
     * The merchant's own sites. They join the nav results, so a site is
     * reachable by typing its name — which is the payoff for putting the tree
     * in `NAV_GROUPS` rather than in the sidebar alone.
     */
    sites?: { id: string; name: string }[];
    /**
     * How many storefronts the business has and may have; `null` = unknown,
     * and "New location" is offered.
     */
    storefronts?: StorefrontAllowance | null;
    /** The business tracks stock; off, Sell › Stock is not offered. */
    stockTracked?: boolean | null;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<SearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    // The query the search couldn't be read for, and how often it was
    // asked again ("Try again").
    const [failedFor, setFailedFor] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    // The last five things opened from here, read when the menu opens.
    const [recents, setRecents] = useState<Recent[]>([]);
    const groups = navFor({
        role,
        roleKey,
        actions: permissions,
        moduleKeys,
        sites,
        storefronts: storefronts?.used ?? null,
        stockTracked,
    });

    const actions = quickActionsFor({
        moduleKeys,
        role,
        actions: permissions,
        siteCount: sites.length,
        storefronts,
    });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setRecents(readRecents(recentsScope));
                setOpen((o) => !o);
            }
        };
        const onOpen = () => {
            setRecents(readRecents(recentsScope));
            setOpen(true);
        };
        document.addEventListener("keydown", onKey);
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => {
            document.removeEventListener("keydown", onKey);
            window.removeEventListener(OPEN_EVENT, onOpen);
        };
    }, [recentsScope]);

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
                .then((r) => {
                    // Not answered is not "found nothing".
                    if (!r.ok) throw new Error("search failed");
                    return r.json() as Promise<{
                        hits?: SearchHit[];
                        failed?: boolean;
                    }>;
                })
                .then((data) => {
                    if (mine !== generation.current) return;
                    if (data.failed || !Array.isArray(data.hits)) {
                        setHits([]);
                        setFailedFor(trimmed);
                        return;
                    }
                    setHits(data.hits);
                    setFailedFor(null);
                })
                .catch(() => {
                    // The palette still works: its pages and actions are
                    // its own. But it says the search didn't answer.
                    if (mine !== generation.current) return;
                    setHits([]);
                    setFailedFor(trimmed);
                })
                .finally(() => {
                    if (mine === generation.current) setSearching(false);
                });
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [query, attempt]);

    const go = (href: string) => {
        setOpen(false);
        setQuery("");
        setHits([]);
        setFailedFor(null);
        // An open edit may hold the page: it asks, and goes if discarded.
        if (mayNavigate(href)) router.push(href);
    };

    /** Open a thing search found, and remember it for next time. */
    const openHit = (hit: SearchHit) => {
        setRecents(
            rememberRecent(recentsScope, {
                kind: hit.kind,
                id: hit.id,
                title: hit.title,
                href: hit.href,
            }),
        );
        go(hit.href);
    };

    const needle = query.trim().toLowerCase();
    const typed = query.trim().length >= 2;
    // Only for the query on screen: a shortened or new one starts clean.
    const failed = typed && !searching && failedFor === query.trim();
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
    const matches = (label: string) =>
        !needle || label.toLowerCase().includes(needle);
    const visibleActions = actions.filter((a) => matches(a.label));
    // Only once something is typed: eight help rows in an empty palette would
    // bury the navigation it is mostly used for.
    const visibleHelp = needle
        ? helpItems(new Date()).filter((h) => matches(h.label))
        : [];

    return (
        <CommandDialog
            label="Search Saroh"
            description="Find a customer, order, booking, product or invoice, start something new, or jump to a page."
            open={open}
            onOpenChange={(next) => {
                if (next) setRecents(readRecents(recentsScope));
                setOpen(next);
                if (!next) {
                    setQuery("");
                    setFailedFor(null);
                }
            }}
            shouldFilter={false}
        >
            <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Search customers, orders, bookings, products…"
            />
            <CommandList>
                <CommandEmpty>
                    {/* Four different states, because they call for four
                        different responses from the person reading them. A
                        search that didn't answer is never "Nothing
                        matches": that would say the customer isn't there. */}
                    {!typed
                        ? "Type at least two characters to search."
                        : busy
                          ? "Searching…"
                          : failed
                            ? SEARCH_FAILED
                            : noMatchLine("pages or actions", query)}
                </CommandEmpty>

                {/* The search didn't answer. Said even when pages or
                    actions below match what was typed, with the way to
                    ask again. */}
                {failed ? (
                    <CommandGroup heading="Search">
                        <p
                            role="status"
                            className="px-2 pb-1.5 pt-1 text-sm text-foreground"
                        >
                            {SEARCH_FAILED}
                        </p>
                        <CommandItem
                            value="search:try-again"
                            onSelect={() => {
                                setFailedFor(null);
                                setAttempt((n) => n + 1);
                            }}
                        >
                            <RotateCw className="mr-2 size-4 shrink-0 text-muted-foreground" />
                            Try again
                        </CommandItem>
                    </CommandGroup>
                ) : null}

                {/* Nothing typed yet: what this person opened last. */}
                {!needle && recents.length > 0 ? (
                    <CommandGroup heading="Recent">
                        {recents.map((recent) => {
                            const Icon = recentIcon(recent.kind);
                            return (
                                <CommandItem
                                    key={`recent:${recent.kind}:${recent.id}`}
                                    value={`recent:${recent.kind}:${recent.id}`}
                                    onSelect={() => go(recent.href)}
                                >
                                    <Icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                    <span className="truncate">
                                        {recent.title}
                                    </span>
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                ) : null}

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
                                    onSelect={() => openHit(hit)}
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
                    /*
                     * A section's pages are destinations too — Services and
                     * Courses live under Bookings now, and before they did
                     * they were rows of their own here. They carry the
                     * section's icon, and match on its name, so "bookings"
                     * finds the whole section. Website's children are the
                     * merchant's sites, which have their own group below.
                     */
                    const entries = group.items.flatMap((item) => {
                        const own = {
                            key: item.href,
                            href: item.href,
                            label: item.label,
                            icon: item.icon,
                            hit: groupMatches || matches(item.label),
                        };
                        if (item.href === WEBSITE_HREF) return [own];
                        const pages = (item.children ?? []).flatMap((child) =>
                            child.href && !child.create
                                ? [
                                      {
                                          key: `${item.href}>${child.href}`,
                                          href: child.href,
                                          label: child.label,
                                          icon: item.icon,
                                          hit: own.hit || matches(child.label),
                                      },
                                  ]
                                : [],
                        );
                        return [own, ...pages];
                    });
                    const items = entries.filter((entry) => entry.hit);
                    if (items.length === 0) return null;
                    return (
                        <CommandGroup key={i} heading={group.label ?? "Go to"}>
                            {items.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <CommandItem
                                        key={item.key}
                                        value={item.key}
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
                 * The settings screen's tabs. The rail offers one Settings row
                 * now, so its pages are listed here, matched on their own
                 * names and on "settings" — and, once something is typed, the
                 * settings on them, the same ones Search settings finds:
                 * "GSTIN" goes to Business, on its tax tab.
                 */}
                {(() => {
                    const actor = {
                        role,
                        actions: permissions,
                        modules: moduleKeys,
                        kind,
                    };
                    const pages = settingsPagesFor(actor)
                        .map((page) => ({
                            ...page,
                            label: settingsPageLabel(page, kind),
                        }))
                        .filter(
                            (page) =>
                                matches("Settings") || matches(page.label),
                        );
                    const settings = needle
                        ? searchSettings(needle, actor, {
                              limit: 5,
                              byPage: false,
                          })
                        : [];
                    if (pages.length === 0 && settings.length === 0) {
                        return null;
                    }
                    return (
                        <CommandGroup heading="Settings">
                            {pages.map((page) => (
                                <CommandItem
                                    key={page.href}
                                    value={page.href}
                                    onSelect={() => go(page.href)}
                                >
                                    <page.icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                    {page.label}
                                </CommandItem>
                            ))}
                            {settings.map((hit) => (
                                <CommandItem
                                    key={`${hit.href}#${hit.label}`}
                                    value={`${hit.href}#${hit.label}`}
                                    onSelect={() => go(hit.href)}
                                >
                                    <SlidersHorizontal className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate">
                                        {hit.label}
                                    </span>
                                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                                        {hit.where}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    );
                })()}
                {/*
                 * Notifications left the rail for the top bar, so the nav
                 * groups above no longer carry it; it stays one search away.
                 */}
                {navCan(
                    { role, actions: permissions },
                    NOTIFICATIONS_NAV.action,
                ) && matches(NOTIFICATIONS_NAV.label) ? (
                    <CommandGroup heading="You">
                        <CommandItem
                            value={NOTIFICATIONS_NAV.href}
                            onSelect={() => go(NOTIFICATIONS_NAV.href)}
                        >
                            <NOTIFICATIONS_NAV.icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                            {NOTIFICATIONS_NAV.label}
                        </CommandItem>
                    </CommandGroup>
                ) : null}
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
                            // Only Website's children are sites; a
                            // section's pages are listed with it above.
                            if (item.href !== WEBSITE_HREF) continue;
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
                                key={item.key}
                                value={item.key}
                                onSelect={() => {
                                    setOpen(false);
                                    setQuery("");
                                    // A new tab, so reading an answer never
                                    // costs the merchant the screen they were
                                    // stuck on.
                                    window.open(
                                        item.href,
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
