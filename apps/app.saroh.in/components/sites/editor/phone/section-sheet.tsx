"use client";

import { elementAt, textOf } from "@/lib/sites/element-style";
import { Button } from "@saroh/ui/button";
import { FormSheetBody } from "@saroh/ui/form-sheet";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { TabStrip } from "@saroh/ui/tabs";
import type { LucideIcon } from "lucide-react";
import {
    ArrowUpDown,
    Brush,
    ChevronRight,
    Copy,
    Eye,
    EyeOff,
    Sparkles,
    Trash2,
    X,
} from "lucide-react";
import type { FocusEvent, MouseEvent, ReactNode } from "react";
import { useRef, useState } from "react";

import { SECTION_ICONS } from "@/components/sites/blocks/block-icons";
import { useServicesForPicker } from "@/components/sites/blocks/use-services-for-picker";
import { SaveFooter } from "@/components/sites/shell/save-footer";
import { count } from "@/lib/format/plural";
import type { Flag, Section } from "@/lib/sites/service";

import { keyboardInsetNow, useKeyboardUp } from "../edit-pill";
import { SECTION_LABELS, sectionTitle } from "../editor-constants";
import { subjectOnCanvas } from "../editor-panels";
import { EditorSheet } from "../editor-sheet";
import { ChromePanel } from "../inspector/chrome-panel";
import { ContentTab } from "../inspector/content-tab";
import { ElementStyleTab } from "../inspector/element-style-tab";
import { FeedbackTab } from "../inspector/feedback-tab";
import { sectionActions } from "../inspector/section-actions";
import { frameOf } from "../inspector/section-frame";
import type { InspectorTab } from "../inspector/site-inspector";
import { StyleTab } from "../inspector/style-tab";
import { VisibilityTab } from "../inspector/visibility-tab";
import { linkPlaces } from "../link-picker";
import { FeedbackPanel } from "../panels/feedback-panel";
import { SaveFailedNotice } from "../save-failed";
import { PriceSheet } from "../sheets/price-sheet";
import type { EditorModel } from "../shell/editor-model";
import type { TextField } from "./text-sheet";
import { longField, richEditorOf, TextSheet } from "./text-sheet";

/**
 * A tapped section on a phone (U49, `fix/WXEEditorPhone`, `fix/WXNSection`):
 * "<name> · <kind> section · n of m", the actions Move · Duplicate · Hide
 * here · Delete · Ask AI, the desk inspector's tabs Content · Style ·
 * Visibility · Feedback n (U47's panes), and Cancel / Save under the save
 * line. Every change is the draft's at once, as on a desk; Save puts the
 * sheet away, Cancel first puts the section back as it was when the sheet
 * opened. A longer text field opens full screen with its word count
 * (`fix/WXNText`). With the header or footer chosen it is their fields,
 * on every page; with nothing chosen, the whole site's notes.
 *
 * No scrim: the page above stays in reach, so the next section is a tap.
 */
export function SectionSheet({
    model,
    open,
    container,
    frame,
    activeFlags,
    unreadableSections,
    onMove,
    onBrand,
    onClose,
}: {
    model: EditorModel;
    open: boolean;
    /** The editor's body, between the two bars. */
    container: HTMLElement | null;
    /** The whole phone editor, for the full-screen text sheet. */
    frame: HTMLElement | null;
    activeFlags: Flag[];
    unreadableSections: string[];
    /** Move: the Sections sheet, where sections are dragged or stepped. */
    onMove: () => void;
    /** Style's "Change the site look": the bar's Brand sheet. */
    onBrand: () => void;
    onClose: () => void;
}) {
    const { siteId, pageId, pages, active, selection, draft, review } = model;
    const readOnly = model.readOnly;
    // A price saved in the price sheet reads the From Services rows again.
    const [servicesRead, setServicesRead] = useState(0);
    const services = useServicesForPicker(servicesRead);
    const act = sectionActions(model);
    const keyboard = useKeyboardUp();
    const [own, setOwn] =
        useState<Exclude<InspectorTab, "feedback">>("content");
    const [priceFor, setPriceFor] = useState<string | null>(null);
    const [text, setText] = useState<TextField | null>(null);
    // The field the text sheet just gave back focus to: not reopened.
    const returned = useRef<HTMLElement | null>(null);

    /*
     * The section as it was when the sheet opened, for Cancel. Taken while
     * rendering, from what the last render saw (no effect), and dropped
     * when the sheet closes or another section is chosen.
     */
    const keyOf = (index: number, section: Section) =>
        section.key ?? `#${index}`;
    const [opened, setOpened] = useState<{
        key: string;
        section: Section;
    } | null>(null);
    const activeKey =
        open && active ? keyOf(active.index, active.section) : null;
    if ((opened?.key ?? null) !== activeKey) {
        setOpened(
            active && activeKey !== null
                ? { key: activeKey, section: active.section }
                : null,
        );
    }

    const tab: InspectorTab =
        selection.inspector === "feedback" ? "feedback" : own;
    const openTab = (next: InspectorTab) => {
        if (next === "feedback") return selection.setInspector("feedback");
        setOwn(next);
        selection.setInspector("block");
    };

    const cancel = () => {
        if (opened) {
            const index = draft.sections.findIndex(
                (s, i) => keyOf(i, s) === opened.key,
            );
            if (index !== -1 && draft.sections[index] !== opened.section) {
                draft.replaceAt(index, opened.section);
            }
        }
        onClose();
    };

    /** A longer field (`longField`) opens full screen to be written in. */
    const openText = (e: FocusEvent | MouseEvent, sectionName: string) => {
        if (readOnly || !(e.target instanceof HTMLElement)) return;
        // A long field, or a rich text editor's page (U47d: Bold and Link).
        const rich = richEditorOf(e.target)
            ? e.target.closest<HTMLElement>(".ProseMirror")
            : null;
        const el = rich ?? e.target;
        if (!rich && !(longField(el) && !el.disabled)) return;
        if (e.type === "focus" && returned.current === el) {
            returned.current = null;
            return;
        }
        const label =
            [
                el instanceof HTMLTextAreaElement ||
                el instanceof HTMLInputElement
                    ? Array.from(el.labels ?? [])
                          .at(0)
                          ?.textContent.trim()
                    : el
                          .closest("[data-slot=field]")
                          ?.querySelector("label")
                          ?.textContent.trim(),
                el.getAttribute("aria-label"),
            ].find(Boolean) ?? "Text";
        setText({ el, label, section: sectionName });
    };

    let head: ReactNode;
    let actions: ReactNode = null;
    let tabs: ReactNode = null;
    let body: ReactNode;
    let footer = !readOnly;
    let title: string;

    if (selection.selectedChrome) {
        const part = selection.selectedChrome;
        title = part === "header" ? "Header" : "Footer";
        head = (
            <SheetHead
                title={title}
                kicker={`On every page · ${count(pages.length, "page")}`}
                onClose={onClose}
            />
        );
        // The same fields and tabs as the desk's (H4).
        tabs = (
            <TabStrip<InspectorTab>
                label={title}
                idPrefix="phone-section"
                tabs={[
                    { value: "content", label: "Content" },
                    { value: "style", label: "Style" },
                    { value: "visibility", label: "Visibility" },
                    { value: "feedback", label: "Feedback" },
                ]}
                value={tab}
                onValueChange={openTab}
                listClassName="px-1 [&>button]:px-3"
            />
        );
        body = (
            <ChromePanel
                part={part}
                tab={tab}
                model={model}
                onBrand={onBrand}
                onWholeSite={() => {
                    selection.setSelectedIndex(null);
                    selection.setInspector("feedback");
                }}
            />
        );
    } else if (active && selection.element) {
        // One button or photo (DEC-251): its Style in the shared sheet,
        // Reset and Done pinned (CSI-C phone).
        const { index, section } = active;
        const el = selection.element;
        const word = el.kind === "button" ? "Button" : "Photo";
        const own = elementAt(section.content, el.path);
        title = textOf(own?.label) || word;
        head = (
            <SheetHead
                title={title}
                kicker={`${sectionTitle(section)} › ${word}`}
                onClose={onClose}
            />
        );
        footer = false;
        body = (
            <ElementStyleTab
                element={el}
                section={section}
                sectionName={sectionTitle(section)}
                scope={selection.elementScope}
                onScope={selection.setElementScope}
                style={model.siteStyle.style}
                styleOptions={model.styleOptions}
                onChange={(next) => draft.replaceAt(index, next)}
                onSiteStyle={model.siteStyle.setStyle}
                foot={(line, reset) => (
                    <div
                        data-element-foot=""
                        className="sticky bottom-0 -mx-4 grid gap-2 border-t bg-background px-4 pb-3 pt-2.5"
                    >
                        <p className="text-xs text-muted-foreground">{line}</p>
                        <div className="flex gap-2">
                            {reset ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-12 min-w-0 flex-1"
                                    onClick={reset.run}
                                >
                                    {reset.word}
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                className="h-12 min-w-0 flex-1"
                                onClick={onClose}
                            >
                                Done
                            </Button>
                        </div>
                    </div>
                )}
            />
        );
    } else if (active) {
        const { index, section } = active;
        const Icon = SECTION_ICONS[section.type];
        const notes =
            section.key === undefined
                ? 0
                : (review.notesByKey.get(section.key) ?? 0);
        const offPhone = frameOf(section).hideOn === "phone";
        title = sectionTitle(section);
        head = (
            <SheetHead
                icon={<Icon aria-hidden className="size-[18px]" />}
                title={title}
                kicker={`${SECTION_LABELS[section.type]} · section ${index + 1} of ${draft.sections.length}`}
                onClose={onClose}
            />
        );
        actions = readOnly ? null : (
            <div
                role="group"
                aria-label="Section actions"
                className="flex shrink-0 gap-1 px-2 pb-2.5 min-[360px]:px-3"
            >
                <Action icon={ArrowUpDown} label="Move" onClick={onMove} />
                <Action
                    icon={Copy}
                    label="Duplicate"
                    onClick={() => act.duplicate(index)}
                />
                <Action
                    icon={offPhone ? Eye : EyeOff}
                    label={offPhone ? "Show here" : "Hide here"}
                    pressed={offPhone}
                    onClick={() => act.hideOnPhone(index, !offPhone)}
                />
                <Action
                    icon={Trash2}
                    label="Delete"
                    onClick={() => model.edits.removeAt(index)}
                />
                {model.askAi ? (
                    <Action
                        icon={Sparkles}
                        label="Ask AI"
                        info
                        onClick={() => model.openAskAi("section")}
                    />
                ) : null}
            </div>
        );
        tabs = (
            <TabStrip<InspectorTab>
                label="Section"
                idPrefix="phone-section"
                tabs={[
                    { value: "content", label: "Content" },
                    { value: "style", label: "Style" },
                    { value: "visibility", label: "Visibility" },
                    {
                        value: "feedback",
                        label: "Feedback",
                        ...(notes > 0 ? { count: notes } : {}),
                    },
                ]}
                value={tab}
                onValueChange={openTab}
                // All four fit at 320; narrower still, the strip scrolls.
                listClassName="px-1 [&>button]:px-3"
            />
        );
        const onChange = (next: Section) => draft.replaceAt(index, next);
        body =
            tab === "style" ? (
                <StyleTab
                    section={section}
                    style={model.siteStyle.style}
                    styleOptions={model.styleOptions}
                    onChange={onChange}
                    onOpenBrand={onBrand}
                />
            ) : tab === "visibility" ? (
                <VisibilityTab
                    section={section}
                    onToggleHidden={() => model.edits.toggleHidden(index)}
                    onHideOnPhone={(hide) => act.hideOnPhone(index, hide)}
                />
            ) : tab === "feedback" ? (
                <FeedbackTab
                    siteId={siteId}
                    pageId={pageId}
                    section={section}
                    comments={review.comments}
                    review={review.review}
                    loadFailed={review.loadFailed}
                    refreshReview={review.refreshReview}
                    onWholeSite={() => {
                        selection.setSelectedIndex(null);
                        selection.setInspector("feedback");
                    }}
                />
            ) : (
                <div
                    className="grid gap-4"
                    onFocusCapture={(e) => openText(e, title)}
                    onClickCapture={(e) => openText(e, title)}
                >
                    {/* The page behind is covered: Couldn't save says it here. */}
                    <SaveFailedNotice draft={draft} />
                    <ContentTab
                        siteId={siteId}
                        section={section}
                        pages={pages}
                        services={services}
                        flags={activeFlags}
                        unreadable={
                            section.key !== undefined &&
                            unreadableSections.includes(section.key)
                        }
                        error={
                            draft.errorIndex === index
                                ? draft.errorMessage
                                : null
                        }
                        heldBack={draft.heldBackAt(index)}
                        onChange={onChange}
                        onPrice={setPriceFor}
                        onAddNote={() => openTab("feedback")}
                    />
                    {readOnly ? null : (
                        <button
                            type="button"
                            onClick={() => openTab("style")}
                            className="flex min-h-14 w-full items-center gap-3 rounded-[10px] border bg-card px-3 py-1.5 text-left text-sm transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Brush aria-hidden className="size-5 shrink-0" />
                            <span className="grid min-w-0 flex-1">
                                <b className="font-semibold">More</b>
                                <span className="text-[0.8125rem] text-muted-foreground">
                                    Look, spacing, who sees it
                                </span>
                            </span>
                            <ChevronRight
                                aria-hidden
                                className="size-[18px] shrink-0 text-muted-foreground"
                            />
                        </button>
                    )}
                </div>
            );
    } else {
        // Nothing chosen: the whole site's notes (Feedback on this site).
        title = "Feedback";
        footer = false;
        body = <FeedbackPanel model={model} />;
        head = <SheetHead title="Feedback on this site" onClose={onClose} />;
    }

    // With the keyboard up the sheet sits on it, its Save in sight.
    const lift = keyboard ? keyboardInsetNow() : 0;

    return (
        <>
            <EditorSheet
                open={open}
                onClose={onClose}
                container={container}
                side="bottom"
                title={title}
                closeLabel="Close the section"
                modal={false}
                // Back to the section on the page, as the old sheet did.
                returnFocus={() =>
                    subjectOnCanvas(model.viewport.canvasRef, selection)
                }
                head={head}
                // Tall enough that the fields scroll under the head, actions
                // and tabs, even at 320 (`fix/WXNSection`). The header's
                // menu chips opened half hidden under Save: it opens tall (H4).
                className={
                    keyboard
                        ? "h-auto max-h-[70%]"
                        : selection.selectedChrome === "header"
                          ? "min-h-[92%]"
                          : "min-h-[min(92%,30rem)]"
                }
            >
                <div
                    data-section-sheet={
                        selection.selectedChrome ?? (active ? tab : "feedback")
                    }
                    className="flex min-h-0 flex-1 flex-col"
                    style={lift > 0 ? { marginBottom: lift } : undefined}
                >
                    {/*
                     * The actions scroll away with the fields and the tabs
                     * stay at the top, so at 320 the form gets the sheet
                     * (editor audit, 21 Nov).
                     */}
                    <FormSheetBody className="mx-0 block gap-0 p-0">
                        {actions}
                        {tabs ? (
                            <div className="sticky top-0 z-10 bg-background">
                                {tabs}
                            </div>
                        ) : null}
                        <div
                            className={
                                active || selection.selectedChrome
                                    ? "px-4 pb-6 pt-3.5"
                                    : undefined
                            }
                        >
                            {body}
                        </div>
                    </FormSheetBody>
                    {footer ? (
                        <SaveFooter className="shrink-0 border-t px-4 pb-3 pt-2 [&>p]:basis-full [&>p]:text-xs">
                            {active && !selection.selectedChrome ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-12 min-w-0 flex-1"
                                    onClick={cancel}
                                >
                                    Cancel
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                className="h-12 min-w-0 flex-1"
                                onClick={onClose}
                            >
                                Save
                            </Button>
                        </SaveFooter>
                    ) : null}
                </div>
            </EditorSheet>
            <PriceSheet
                siteId={siteId}
                serviceId={priceFor}
                onClose={() => setPriceFor(null)}
                onSaved={() => setServicesRead((n) => n + 1)}
            />
            <TextSheet
                field={text}
                container={frame}
                links={{
                    places: linkPlaces(pages, pageId, draft.sections),
                    services:
                        services.status === "ready" ? services.services : [],
                    businessPhone: model.businessPhone,
                }}
                onClose={() => {
                    returned.current = text?.el ?? null;
                    setText(null);
                }}
            />
        </>
    );
}

function SheetHead({
    icon,
    title,
    kicker,
    onClose,
}: {
    icon?: ReactNode;
    title: string;
    kicker?: string;
    onClose: () => void;
}) {
    return (
        <div className="flex shrink-0 items-center gap-2.5 pb-1.5 pl-4 pr-2">
            {icon ? (
                <span
                    aria-hidden
                    className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-secondary text-foreground"
                >
                    {icon}
                </span>
            ) : null}
            <div className="min-w-0 flex-1">
                <h2
                    data-ph-mask=""
                    className="truncate text-[0.9375rem] font-semibold"
                >
                    {title}
                </h2>
                {kicker ? (
                    <p className="truncate text-xs text-muted-foreground">
                        {kicker}
                    </p>
                ) : null}
            </div>
            <IconButton
                label="Close the section"
                icon={<X />}
                onClick={onClose}
                tooltip={false}
                className="size-11 [&_svg]:size-5"
            />
        </div>
    );
}

function Action({
    icon: Icon,
    label,
    info = false,
    pressed,
    onClick,
}: {
    icon: LucideIcon;
    label: string;
    info?: boolean;
    pressed?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            onClick={onClick}
            className={cn(
                "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-[10px] border bg-card px-0 text-xs font-medium text-foreground transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[359px]:text-[0.6875rem]",
                info &&
                    "border-info-subtle-foreground/20 bg-info-subtle text-info-subtle-foreground hover:bg-info-subtle hover:brightness-95",
            )}
        >
            <Icon aria-hidden className="size-[18px] shrink-0" />
            <span className="max-w-full truncate">{label}</span>
        </button>
    );
}
