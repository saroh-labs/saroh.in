"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent } from "@saroh/ui/card";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { MediaPicker } from "@/components/sites/media-picker";
import { ShareCards } from "@/components/sites/share-cards";
import dynamic from "next/dynamic";

/* On demand and browser-only, for the same reasons as in the editor. */
const RichTextEditor = dynamic(
    () =>
        import("@/components/sites/rich-text-editor").then(
            (m) => m.RichTextEditor,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="min-h-40 animate-pulse rounded-md border bg-muted" />
        ),
    },
);

import {
    updateSiteFooter,
    updateSiteNavigation,
    updateSiteSettings,
} from "@/lib/sites/actions";
import { exactDate } from "@/lib/sites/format-date";
import type {
    SiteDetail,
    SiteFooter,
    SiteNavigationItem,
    SiteSettingsInput,
} from "@/lib/sites/service";

/**
 * A site's address, search appearance and share card (#188).
 *
 * Everything here is DRAFT state. It reaches the public only through the next
 * publish, like a section edit — so the page says that rather than letting a
 * merchant change a search title and wonder why Google never updates.
 *
 * Rows follow the design: a label, the value, and the one action that changes
 * it. Editing happens in place; there is no page-level Save, because a settings
 * form that saves everything at once lets a stale tab overwrite a field someone
 * else changed. Each field PATCHes only itself.
 */

/** Search engines truncate around here. Guidance, never enforcement. */
const TITLE_GUIDE = 60;
const DESCRIPTION_GUIDE = 155;

function Section({
    title,
    description,
    badge,
    children,
}: {
    title: string;
    description: string;
    badge?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    {badge}
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Card className="wk-surface">
                <CardContent className="divide-y divide-border p-0">
                    {children}
                </CardContent>
            </Card>
        </section>
    );
}

function Row({
    label,
    children,
    action,
}: {
    label: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="grid items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="min-w-0 text-sm">{children}</div>
            {action ? (
                <div className="justify-self-start sm:justify-self-end">
                    {action}
                </div>
            ) : (
                <div />
            )}
        </div>
    );
}

const Missing = () => (
    <span className="text-muted-foreground/70">Nothing set yet</span>
);

export function SiteSettings({ site }: { site: SiteDetail }) {
    const [seoTitle, setSeoTitle] = useState(site.seoTitle ?? "");
    const [seoDescription, setSeoDescription] = useState(
        site.seoDescription ?? "",
    );
    const [socialImageUrl, setSocialImageUrl] = useState(
        site.socialImageUrl ?? "",
    );
    // Facts about the picture, kept beside its address (#220). A pick from
    // the library brings them along; a pasted address is measured in the
    // browser, and its size on disk stays unknown.
    const [socialImageFacts, setSocialImageFacts] = useState<{
        width: number | null;
        height: number | null;
        bytes: number | null;
    }>({
        width: site.socialImageWidth,
        height: site.socialImageHeight,
        bytes: site.socialImageBytes,
    });
    // The address whose measurement is still in flight, so a slow picture
    // that finishes after the merchant has moved on cannot stamp its size on
    // the next one. Touched only from event handlers, never during render.
    const measuring = useRef<string | null>(null);
    function chooseShareImage(
        src: string,
        facts?: { width?: number; height?: number; bytes?: number },
    ) {
        setSocialImageUrl(src);
        measuring.current = null;
        if (facts) {
            setSocialImageFacts({
                width: facts.width ?? null,
                height: facts.height ?? null,
                bytes: facts.bytes ?? null,
            });
            return;
        }
        setSocialImageFacts({ width: null, height: null, bytes: null });
        if (!src.trim()) return;
        // Measure a pasted address. Cross-origin pictures still report their
        // natural size; a URL that never loads leaves the facts unknown.
        measuring.current = src;
        const img = new Image();
        img.onload = () => {
            if (measuring.current !== src) return;
            setSocialImageFacts((f) => ({
                ...f,
                width: img.naturalWidth,
                height: img.naturalHeight,
            }));
        };
        img.src = src;
    }
    const [footerValue, setFooterValue] = useState(site.footer?.value ?? "");
    const [footerFormat, setFooterFormat] = useState<SiteFooter["format"]>(
        site.footer?.format ?? "html",
    );
    const router = useRouter();
    const [editing, setEditing] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const address = site.subdomain ? `${site.subdomain}.saroh.app` : null;
    const live = Boolean(site.currentPublication);

    function save(input: SiteSettingsInput, label: string) {
        startTransition(async () => {
            const res = await updateSiteSettings(site.id, input);
            if (!res.ok) {
                toast.error(res.error);
                return;
            }
            setEditing(null);
            // Local state already shows the new value; refresh so the server
            // props agree with it and a reload does not appear to lose the edit.
            router.refresh();
            toast.success(`${label} saved. Publish to make it public.`);
        });
    }

    const [menu, setMenu] = useState<SiteNavigationItem[]>(
        site.navigation?.items ?? [],
    );
    const pagesById = new Map(site.pages.map((p) => [p.id, p]));
    const inMenu = new Set(menu.map((m) => m.pageId));

    function saveMenu() {
        startTransition(async () => {
            const res = await updateSiteNavigation(
                site.id,
                menu.length ? { items: menu } : null,
            );
            if (!res.ok) {
                toast.error(res.error);
                return;
            }
            setEditing(null);
            router.refresh();
            toast.success(
                menu.length
                    ? "Menu saved. Publish to make it public."
                    : "Menu removed. Publish to take it off the site.",
            );
        });
    }
    const moveMenu = (i: number, d: -1 | 1) =>
        setMenu((m) => {
            const j = i + d;
            if (j < 0 || j >= m.length) return m;
            const next = [...m];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    function saveFooter() {
        startTransition(async () => {
            // Empty IS the delete. The api collapses a blank value to null, so
            // a merchant clears the box to remove the footer and there is no
            // separate remove control to hunt for.
            const next: SiteFooter | null =
                footerValue.trim() === ""
                    ? null
                    : { format: footerFormat, value: footerValue };
            const res = await updateSiteFooter(site.id, next);
            if (!res.ok) {
                toast.error(res.error);
                return;
            }
            setEditing(null);
            router.refresh();
            toast.success(
                next === null
                    ? "Footer removed. Publish to take it off the site."
                    : "Footer saved. Publish to make it public.",
            );
        });
    }

    return (
        <div className="space-y-8">
            <Section
                title="Site status"
                description={
                    live
                        ? "Live, with a record of every publish."
                        : "Not published yet. Nobody can reach this site."
                }
                badge={
                    <Badge
                        className={cn(
                            live
                                ? "bg-success text-success-foreground"
                                : "border border-border bg-transparent text-muted-foreground",
                        )}
                    >
                        {live ? "Live" : "Draft"}
                    </Badge>
                }
            >
                <Row
                    label="Address"
                    action={
                        live && address ? (
                            <Button variant="outline" size="sm" asChild>
                                <a
                                    href={`https://${address}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    View
                                </a>
                            </Button>
                        ) : undefined
                    }
                >
                    {address ?? <Missing />}
                </Row>
                <Row label="Last published">
                    {site.currentPublication ? (
                        // Pinned locale and zone (format-date.ts): the server
                        // wrote "03/09/2026, 21:34:34" and the browser
                        // "9/3/2026, 9:34:34 PM" for the same instant, and
                        // React reported the difference as a hydration error
                        // on every visit to this page.
                        exactDate(site.currentPublication.publishedAt)
                    ) : (
                        <span className="text-muted-foreground/70">Never</span>
                    )}
                </Row>
                {/*
                 * What is waiting to go live (#190).
                 *
                 * The same number the editor's top bar shows, from the same
                 * server-side diff — a merchant who reads "3 sections changed"
                 * here and something else in the editor learns to trust
                 * neither. Only shown once the site has published: before that
                 * the status above already says nobody can reach it, and a
                 * count of changes against nothing would be noise.
                 */}
                {live ? (
                    <Row label="Waiting to publish">
                        {site.pendingSectionChanges ? (
                            `${site.pendingSectionChanges} section${site.pendingSectionChanges === 1 ? "" : "s"} changed since the last publish`
                        ) : (
                            <span className="text-muted-foreground/70">
                                Nothing — the live site matches your draft
                            </span>
                        )}
                    </Row>
                ) : null}
            </Section>

            <Section
                title="Saroh address"
                description="Every site gets one of these and keeps it, even after you connect your own domain."
            >
                <Row label="Subdomain">{address ?? <Missing />}</Row>
            </Section>

            <Section
                title="Search"
                description="What people see before they click."
            >
                <Row
                    label="Title"
                    action={
                        editing === "title" ? (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="brand"
                                    disabled={pending}
                                    onClick={() =>
                                        save(
                                            { seoTitle: seoTitle || null },
                                            "Title",
                                        )
                                    }
                                >
                                    Save
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() => {
                                        setSeoTitle(site.seoTitle ?? "");
                                        setEditing(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing("title")}
                            >
                                Edit
                            </Button>
                        )
                    }
                >
                    {editing === "title" ? (
                        <div className="space-y-1">
                            <Input
                                value={seoTitle}
                                autoFocus
                                onChange={(e) => setSeoTitle(e.target.value)}
                                aria-label="Search title"
                            />
                            {/* Guidance, not a limit: search engines truncate,
                                they do not reject. Stating the number beats a
                                silent cut-off the merchant never sees. */}
                            <p className="text-xs text-muted-foreground">
                                {seoTitle.length > TITLE_GUIDE
                                    ? `Aim for ${TITLE_GUIDE} characters or fewer. Currently ${seoTitle.length}.`
                                    : `${seoTitle.length} of about ${TITLE_GUIDE} characters.`}
                            </p>
                        </div>
                    ) : (
                        seoTitle || <Missing />
                    )}
                </Row>

                <Row
                    label="Description"
                    action={
                        editing === "description" ? (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="brand"
                                    disabled={pending}
                                    onClick={() =>
                                        save(
                                            {
                                                seoDescription:
                                                    seoDescription || null,
                                            },
                                            "Description",
                                        )
                                    }
                                >
                                    Save
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() => {
                                        setSeoDescription(
                                            site.seoDescription ?? "",
                                        );
                                        setEditing(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing("description")}
                            >
                                Edit
                            </Button>
                        )
                    }
                >
                    {editing === "description" ? (
                        <div className="space-y-1">
                            <Textarea
                                value={seoDescription}
                                rows={3}
                                autoFocus
                                onChange={(e) =>
                                    setSeoDescription(e.target.value)
                                }
                                aria-label="Search description"
                            />
                            <p className="text-xs text-muted-foreground">
                                {seoDescription.length > DESCRIPTION_GUIDE
                                    ? `Aim for ${DESCRIPTION_GUIDE} characters or fewer. Currently ${seoDescription.length}.`
                                    : `${seoDescription.length} of about ${DESCRIPTION_GUIDE} characters.`}
                            </p>
                        </div>
                    ) : (
                        seoDescription || <Missing />
                    )}
                </Row>

                {/* The point of the section: what the merchant is actually
                    buying with those two fields. */}
                <Row label="Preview">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                            {seoTitle || site.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                            {address ?? "not published"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                            {seoDescription || "No description yet."}
                        </div>
                    </div>
                </Row>
            </Section>

            <Section
                title="Social share image"
                description="Used when someone posts a link to your site."
            >
                <Row
                    label="Image"
                    action={
                        editing === "social" ? (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="brand"
                                    disabled={pending}
                                    onClick={() =>
                                        save(
                                            socialImageUrl
                                                ? {
                                                      socialImageUrl,
                                                      socialImageWidth:
                                                          socialImageFacts.width,
                                                      socialImageHeight:
                                                          socialImageFacts.height,
                                                      socialImageBytes:
                                                          socialImageFacts.bytes,
                                                  }
                                                : {
                                                      socialImageUrl: null,
                                                      socialImageWidth: null,
                                                      socialImageHeight: null,
                                                      socialImageBytes: null,
                                                  },
                                            "Share image",
                                        )
                                    }
                                >
                                    Save
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() => {
                                        setSocialImageUrl(
                                            site.socialImageUrl ?? "",
                                        );
                                        measuring.current = null;
                                        setSocialImageFacts({
                                            width: site.socialImageWidth,
                                            height: site.socialImageHeight,
                                            bytes: site.socialImageBytes,
                                        });
                                        setEditing(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing("social")}
                            >
                                {socialImageUrl ? "Replace" : "Add"}
                            </Button>
                        )
                    }
                >
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted text-muted-foreground">
                                {socialImageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL, not a project asset
                                    <img
                                        src={socialImageUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <ImageIcon className="h-4 w-4" />
                                )}
                            </div>
                            <div className="min-w-0 text-xs">
                                {socialImageUrl ? (
                                    <span className="break-all text-muted-foreground">
                                        {socialImageUrl}
                                    </span>
                                ) : (
                                    <>
                                        <Missing />
                                        <p className="text-muted-foreground">
                                            1200×630 works everywhere.
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                        {editing === "social" ? (
                            <div className="grid gap-1.5">
                                <MediaPicker
                                    onPick={(img) =>
                                        chooseShareImage(img.src, img)
                                    }
                                />
                                <Input
                                    value={socialImageUrl}
                                    placeholder="or paste an image address"
                                    onChange={(e) =>
                                        chooseShareImage(e.target.value)
                                    }
                                    aria-label="Share image address"
                                />
                            </div>
                        ) : null}
                    </div>
                </Row>

                {/* The point of the picture: what the link looks like when it
                    is posted (#220). Drawn from the fields above, live. */}
                <Row label="When shared">
                    <ShareCards
                        title={seoTitle || site.name}
                        description={seoDescription}
                        siteName={site.name}
                        domain={address}
                        image={
                            socialImageUrl
                                ? { url: socialImageUrl, ...socialImageFacts }
                                : null
                        }
                        liveUrl={live && address ? `https://${address}` : null}
                    />
                </Row>
            </Section>

            <Section
                title="Menu"
                description="The links at the top of every page. Pick the pages, put them in order, and rename an entry if the page title is too long for a menu."
            >
                <Row
                    label="Pages"
                    action={
                        editing === "menu" ? (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="brand"
                                    disabled={pending}
                                    onClick={saveMenu}
                                >
                                    Save
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() => {
                                        setMenu(site.navigation?.items ?? []);
                                        setEditing(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing("menu")}
                            >
                                {site.navigation ? "Edit" : "Build"}
                            </Button>
                        )
                    }
                >
                    {editing === "menu" ? (
                        <div className="grid gap-3">
                            {/* The menu, in order. */}
                            {menu.length ? (
                                <ol className="grid gap-1.5">
                                    {menu.map((item, i) => {
                                        const page = pagesById.get(item.pageId);
                                        return (
                                            <li
                                                key={item.pageId}
                                                className="flex items-center gap-2"
                                            >
                                                <Input
                                                    value={item.label ?? ""}
                                                    placeholder={
                                                        page?.title ?? "Page"
                                                    }
                                                    aria-label={`Menu label for ${page?.title ?? "page"}`}
                                                    className="h-8"
                                                    onChange={(e) =>
                                                        setMenu((m) =>
                                                            m.map((x, j) =>
                                                                j === i
                                                                    ? {
                                                                          pageId: x.pageId,
                                                                          ...(e.target.value.trim()
                                                                              ? {
                                                                                    label: e
                                                                                        .target
                                                                                        .value,
                                                                                }
                                                                              : {}),
                                                                      }
                                                                    : x,
                                                            ),
                                                        )
                                                    }
                                                />
                                                <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                                                    {page?.path}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0"
                                                    aria-label="Move up"
                                                    disabled={i === 0}
                                                    onClick={() =>
                                                        moveMenu(i, -1)
                                                    }
                                                >
                                                    ↑
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0"
                                                    aria-label="Move down"
                                                    disabled={
                                                        i === menu.length - 1
                                                    }
                                                    onClick={() =>
                                                        moveMenu(i, 1)
                                                    }
                                                >
                                                    ↓
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0"
                                                    aria-label={`Remove ${page?.title ?? "page"} from the menu`}
                                                    onClick={() =>
                                                        setMenu((m) =>
                                                            m.filter(
                                                                (_, j) =>
                                                                    j !== i,
                                                            ),
                                                        )
                                                    }
                                                >
                                                    ×
                                                </Button>
                                            </li>
                                        );
                                    })}
                                </ol>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    No pages in the menu yet.
                                </p>
                            )}
                            {/* Pages not yet in the menu. Hidden pages are not offered: an entry for one is the exact dead link the pre-publish check flags. */}
                            {site.pages.filter(
                                (p) => !inMenu.has(p.id) && !p.hidden,
                            ).length ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {site.pages
                                        .filter(
                                            (p) =>
                                                !inMenu.has(p.id) && !p.hidden,
                                        )
                                        .map((p) => (
                                            <Button
                                                key={p.id}
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs"
                                                onClick={() =>
                                                    setMenu((m) => [
                                                        ...m,
                                                        { pageId: p.id },
                                                    ])
                                                }
                                            >
                                                + {p.title}
                                            </Button>
                                        ))}
                                </div>
                            ) : null}
                        </div>
                    ) : site.navigation ? (
                        <span className="text-muted-foreground">
                            {site.navigation.items
                                .map(
                                    (i) =>
                                        i.label ??
                                        pagesById.get(i.pageId)?.title ??
                                        "?",
                                )
                                .join(" · ")}
                        </span>
                    ) : (
                        <Missing />
                    )}
                </Row>
            </Section>

            <Section
                title="Footer"
                description="The last thing on every page. Yours to write — an address, opening hours, a way to get in touch."
            >
                <Row
                    label="Text"
                    action={
                        editing === "footer" ? (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="brand"
                                    disabled={pending}
                                    onClick={saveFooter}
                                >
                                    Save
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() => {
                                        setFooterValue(
                                            site.footer?.value ?? "",
                                        );
                                        setFooterFormat(
                                            site.footer?.format ?? "html",
                                        );
                                        setEditing(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing("footer")}
                            >
                                {site.footer ? "Edit" : "Add"}
                            </Button>
                        )
                    }
                >
                    {editing === "footer" ? (
                        <div className="space-y-2">
                            {footerFormat === "html" ? (
                                <RichTextEditor
                                    value={footerValue}
                                    onChange={setFooterValue}
                                    placeholder="Northwind Supply · Peenya, Bengaluru · how to reach you"
                                />
                            ) : (
                                <Textarea
                                    value={footerValue}
                                    onChange={(e) =>
                                        setFooterValue(e.target.value)
                                    }
                                    rows={4}
                                    placeholder="Northwind Supply\nPeenya, Bengaluru"
                                    aria-label="Footer text"
                                />
                            )}
                            {/*
                             * The same two formats a richText section offers,
                             * because this IS that content model — one
                             * authoring shape, one sanitizer, and one editor to
                             * upgrade when the rich text editor lands (#208).
                             */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Written as</span>
                                {(["html", "markdown"] as const).map((f) => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setFooterFormat(f)}
                                        aria-pressed={footerFormat === f}
                                        className={cn(
                                            "rounded px-2 py-0.5 transition-colors",
                                            footerFormat === f
                                                ? "bg-secondary text-secondary-foreground"
                                                : "hover:text-foreground active:bg-secondary/60",
                                        )}
                                    >
                                        {f === "html" ? "HTML" : "Plain text"}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Clear the box to remove the footer. Links and
                                basic formatting are kept; anything else is
                                stripped when you publish.
                            </p>
                        </div>
                    ) : site.footer ? (
                        <span className="whitespace-pre-wrap break-words text-muted-foreground">
                            {site.footer.value}
                        </span>
                    ) : (
                        <Missing />
                    )}
                </Row>
            </Section>

            {/* Say what is true: none of this is public until it is published. */}
            <p className="text-sm text-muted-foreground">
                These settings are part of your draft. They reach your live site
                the next time you publish.
            </p>
        </div>
    );
}
