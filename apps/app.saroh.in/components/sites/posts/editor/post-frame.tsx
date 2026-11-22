"use client";

import { couldntLoad, couldntLoadLine } from "@saroh/ui/lib/state-copy";
import { showError } from "@saroh/ui/toast";
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import { FailedState } from "@saroh/ui/data-state";

import { PageLoading } from "@/components/shared/page/page-loading";
import { PanelDivider } from "@/components/sites/editor/editor-chrome";
import { EditorTrail } from "@/components/sites/editor/shell/editor-trail";
import { InspectorFrame } from "@/components/sites/editor/shell/inspector-frame";
import {
    RIGHT_MIN,
    RightColumn,
    useRightWidth,
} from "@/components/sites/editor/shell/right-column";
import { useEditorLayout } from "@/components/sites/editor/use-editor-layout";
import { AddList } from "@/components/sites/rich-text/writing-menus";
import {
    answers,
    armFullLoadCatch,
    resetRouterAfterCatch,
} from "@/lib/navigation/caught-full-load";

import {
    POST_HISTORY_READY,
    PostHistoryPanel,
} from "../history/post-history-panel";
import { ApprovalBand } from "../review/approval-band";
import type { DetailsRow } from "./details-tab";
import { PostFind } from "./post-find";
import type { InspectorTab } from "./post-inspector";
import { PostInspector, PostInspectorHeader } from "./post-inspector";
import type { PostEditorData, PostEditorModel } from "./post-model";
import { PostMoreMenu } from "./post-more-menu";
import { PostBanner } from "./post-states";
import { PostTopBar } from "./post-top-bar";
import type { PostTrailKey } from "./post-trail";
import { postTrailTabs } from "./post-trail";
import { PostsLeftPanel } from "./posts-left-panel";

/** What the open post hands the frame: its model and the bar's actions. */
export interface PostLive {
    /** The post's id, or "new": a change resets what was per post. */
    key: string;
    model: PostEditorModel;
    editor: Editor | null;
    onPublish: () => void;
    onDiscard?: () => void;
}

interface PostFrameControls {
    previewing: boolean;
    toolbar: boolean;
    setToolbar: (on: boolean) => void;
    /** The cover on the page was pressed: Details › Cover. */
    openCover: () => void;
    /** The open post, or null once it has gone (another one is loading). */
    show: (live: PostLive | null) => void;
    /** No post is coming: it failed (the frame stays), or a refusal (it goes). */
    away: (mode: FrameMode) => void;
    /** The next post's fetch failed (caught, not a full page load). */
    caught: boolean;
    /** Try it again, in place; a second failure loads the page in full. */
    retry: () => void;
}

type FrameMode = "post" | "failed" | "off";

const FrameContext = createContext<PostFrameControls | null>(null);

/** The frame the post is drawn in, or null outside one. */
export function usePostFrame(): PostFrameControls | null {
    return useContext(FrameContext);
}

/**
 * The post editor's frame (`write/layout.tsx`): the bar, the rail, the left
 * panel and the right column, mounted ONCE for every post. Opening another
 * post swaps only the page's writing surface (its `loading.tsx` is the
 * writing surface's skeleton); the bar's post parts and the inspector show
 * theirs until the new post hands its model over (`show`). So the list
 * keeps its place, the rail its tab and the right column Ask AI's
 * conversation (docs/patterns/frontend-data-and-state.md, "Loading inside a
 * screen").
 *
 * Every post-specific part is drawn from `live`, which the open post sets
 * after each of its renders: the draft (autosave, the leave guard) stays the
 * post's own, keyed by it, and goes with it.
 */
export function PostFrame({ children }: { children: ReactNode }) {
    const phone = useEditorLayout() === "phone";
    const [live, setLive] = useState<PostLive | null>(null);
    // The site's side of the last post (its list, its categories): it
    // doesn't change with the post, so it stays drawn while the next loads.
    const [site, setSite] = useState<PostEditorData | null>(null);
    const [trailPick, setTrail] = useState<PostTrailKey | null>(null);
    const [tabPick, setTab] = useState<InspectorTab | null>(null);
    const [editing, setEditing] = useState<DetailsRow>(null);
    const [toolbar, setToolbar] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [mode, away] = useState<FrameMode>("post");
    const [finding, setFinding] = useState(false);
    const right = useRightWidth();

    // Another post: what was open on the last one closes.
    const key = live?.key ?? null;
    const [seen, setSeen] = useState(key);
    if (key !== null && key !== seen) {
        setSeen(key);
        setEditing(null);
        setToolbar(false);
        setPreviewing(false);
    }

    /*
     * A post's fetch failing while "online" (owner, 21 Nov): Next would load
     * the whole page instead, so the frame catches it (`caught-full-load.ts`).
     * With the loader up, the writing surface says "Couldn't load this post"
     * with Try again; with the last post still up (nothing had moved), it
     * stays, and a toast says the other one didn't open.
     */
    const [caught, setCaught] = useState(false);
    const siteId = (live?.model.data ?? site)?.siteId ?? null;
    const onScreen = useRef(false);
    const letThrough = useRef(false);
    // Each catch disarms itself: the next round arms again.
    const [round, nextRound] = useState(0);
    useEffect(() => {
        if (!siteId || caught) return;
        return armFullLoadCatch(
            (url) =>
                !letThrough.current &&
                url.pathname.startsWith(`/sites/${siteId}/write/`),
            (url) => {
                void answers(url).then((ok) => {
                    // Nothing failed (a new deploy, a scripted load): go.
                    if (ok) {
                        letThrough.current = true;
                        window.location.assign(url.href);
                        return;
                    }
                    failedLoad();
                });
            },
        );
        function failedLoad() {
            if (onScreen.current) {
                showError(
                    `${couldntLoadLine("that post")} Check your connection.`,
                );
                resetRouterAfterCatch();
                nextRound((n) => n + 1);
                return;
            }
            setCaught(true);
        }
    }, [siteId, caught, round]);
    useEffect(() => {
        onScreen.current = live !== null;
        if (live) letThrough.current = false;
    }, [live]);
    const retry = useCallback(() => {
        letThrough.current = true;
        setCaught(false);
        resetRouterAfterCatch();
    }, []);

    const show = useCallback((next: PostLive | null) => {
        setLive(next);
        if (next) setSite(next.model.data);
    }, []);
    const openCover = useCallback(() => {
        setTab("details");
        setEditing("cover");
    }, []);
    const controls = useMemo(
        () => ({
            previewing,
            toolbar,
            setToolbar,
            openCover,
            show,
            away,
            caught,
            retry,
        }),
        [previewing, toolbar, openCover, show, caught, retry],
    );

    const model = live?.model ?? null;
    const data = model?.data ?? site;
    // A reader opens on the notes (DEC-200 U8), as the shell did.
    const reading = Boolean(data?.readOnly && data.feedback);
    const trail = trailPick ?? (reading ? "feedback" : "posts");
    const tab =
        tabPick ?? (reading && model?.draft.postId ? "feedback" : "details");
    const feedback = data?.feedback;
    const tabs = data
        ? postTrailTabs({
              readOnly: data.readOnly || data.paused,
              history: POST_HISTORY_READY,
              openNotes:
                  feedback?.comments.filter((c) => c.resolvedAt === null)
                      .length ?? 0,
              feedback: Boolean(
                  feedback && (model ? model.draft.postId : true),
              ),
          })
        : [];

    // ⌘K opens Find (W6), as in the site editor.
    useEffect(() => {
        if (phone || mode === "off") return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setFinding(true);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [phone, mode]);

    function onTrail(next: PostTrailKey) {
        if (next === "feedback") setTab("feedback");
        setTrail(next);
    }

    // A post is on its way: grey where it will be. It failed: nothing.
    const busy = mode === "post" && !caught;
    const regionLoading = (label: string) =>
        busy ? (
            <PageLoading shape="inspector" width="full" bare label={label} />
        ) : null;

    const left =
        trail === "add" ? (
            <section aria-label="Add" className="flex min-h-0 flex-1 flex-col">
                <h2 className="flex h-12 shrink-0 items-center px-4 text-[0.9375rem] font-semibold">
                    Add to the post
                </h2>
                <p className="px-4 pb-1 text-[0.8125rem] text-muted-foreground">
                    Adds where the cursor is. Or type / on an empty line.
                </p>
                <AddList editor={live?.editor ?? null} />
            </section>
        ) : trail === "history" && POST_HISTORY_READY ? (
            model ? (
                <PostHistoryPanel model={model} />
            ) : (
                regionLoading("Loading the post's history")
            )
        ) : data ? (
            <PostsLeftPanel data={data} model={model} busy={busy} />
        ) : (
            regionLoading("Loading your posts")
        );

    const chrome = !phone && mode !== "off";
    const side = chrome && !previewing;
    return (
        <FrameContext.Provider value={controls}>
            {/* One tree for phone and desk, so crossing 760px never remounts the post (and its draft). */}
            <div
                className={
                    chrome ? "flex h-dvh flex-col bg-background" : "contents"
                }
            >
                {chrome ? (
                    <PostTopBar
                        siteId={data?.siteId ?? null}
                        lastReadOnly={data?.readOnly}
                        lastPaused={data?.paused}
                        model={model}
                        busy={busy}
                        editor={live?.editor ?? null}
                        previewing={previewing}
                        onPreview={setPreviewing}
                        onPublish={live?.onPublish ?? noop}
                        more={
                            model ? (
                                <PostMoreMenu
                                    model={model}
                                    onMoreFormatting={() => setToolbar(true)}
                                    onFind={() => setFinding(true)}
                                />
                            ) : null
                        }
                        onDiscard={live?.onDiscard}
                    />
                ) : null}
                {chrome && model ? (
                    <PostFind
                        model={model}
                        editor={live?.editor ?? null}
                        open={finding}
                        onOpenChange={setFinding}
                        go={{
                            details: () => setTab("details"),
                            search: () => setTab("search"),
                            feedback:
                                feedback && model.draft.postId
                                    ? () => onTrail("feedback")
                                    : null,
                            history:
                                POST_HISTORY_READY && model.draft.postId
                                    ? () => setTrail("history")
                                    : null,
                            add: () => setTrail("add"),
                            publish: live?.onPublish ?? noop,
                        }}
                    />
                ) : null}
                {chrome && model ? <PostBanner model={model} /> : null}
                {chrome && model ? <ApprovalBand model={model} /> : null}
                <div className={chrome ? "flex min-h-0 flex-1" : "contents"}>
                    {side ? (
                        <EditorTrail
                            tabs={tabs}
                            value={trail}
                            onSelect={onTrail}
                        />
                    ) : null}
                    {side ? (
                        <div
                            data-left-panel={trail}
                            className="flex w-[264px] shrink-0 flex-col border-r bg-card max-[1200px]:hidden"
                        >
                            {left}
                        </div>
                    ) : null}
                    <div
                        role={chrome ? "main" : undefined}
                        aria-label={chrome ? "Post" : undefined}
                        className={
                            chrome
                                ? "grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)]"
                                : "contents"
                        }
                    >
                        {children}
                    </div>
                    {side ? (
                        <div className="flex w-px shrink-0 [&>*]:flex-1">
                            <PanelDivider
                                label="Resize the right column"
                                width={right.width}
                                min={RIGHT_MIN}
                                max={right.max}
                                reset={right.reset}
                                onResize={right.setWidth}
                                onNudge={right.nudge}
                                panelSide="right"
                            />
                        </div>
                    ) : null}
                    {side ? (
                        <div
                            className="flex max-w-[calc(100vw-20rem)] shrink-0 [&>*]:flex-1"
                            style={{ width: right.width }}
                        >
                            <RightColumn
                                askAi={Boolean(data?.askAi && !data.readOnly)}
                            >
                                {model ? (
                                    <PostInspector
                                        model={model}
                                        tab={tab}
                                        onTab={(t) => {
                                            setTab(t);
                                            if (
                                                t !== "feedback" &&
                                                trail === "feedback"
                                            )
                                                setTrail("posts");
                                        }}
                                        editing={editing}
                                        onEditing={setEditing}
                                    />
                                ) : (
                                    <InspectorFrame
                                        header={<PostInspectorHeader />}
                                    >
                                        {regionLoading(
                                            "Loading the post's details",
                                        )}
                                    </InspectorFrame>
                                )}
                            </RightColumn>
                        </div>
                    ) : null}
                </div>
            </div>
        </FrameContext.Provider>
    );
}

// The bar draws no Publish without a post; nothing to open meanwhile.
function noop() {
    return undefined;
}

/**
 * Drawn by what stands in the post's place when there is no post: a
 * segment's `error.tsx` (the frame stays, the list still opens another
 * post) or a refusal (`off`: the frame goes, the refusal has the screen).
 */
export function PostFrameAway({ off = false }: { off?: boolean }) {
    const frame = usePostFrame();
    const away = frame?.away;
    useLayoutEffect(() => {
        if (!away) return;
        away(off ? "off" : "failed");
        return () => away("post");
    }, [away, off]);
    return null;
}

/**
 * The writing surface while a post loads (`[postId]/loading.tsx`,
 * `new/loading.tsx`): its skeleton, or, when the fetch failed and the frame
 * caught it, "Couldn't load this post" with Try again in the same place.
 */
export function PostLoading() {
    const frame = usePostFrame();
    if (frame?.caught) {
        return (
            <div className="grid min-h-0 place-items-center p-6">
                <FailedState
                    title={couldntLoad("this post")}
                    description="Check your connection. Your writing is safe."
                    onRetry={frame.retry}
                />
            </div>
        );
    }
    return (
        <PageLoading
            shape="writing"
            width="full"
            bare
            bodyClassName="min-h-0"
            label="Opening the post"
        />
    );
}
