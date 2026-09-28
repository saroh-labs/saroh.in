import { describe, expect, it } from "vitest";

import type { RecordFacts, SaveEvent, SaveState } from "./state";
import {
    initialSave,
    isSettled,
    joinAnd,
    leaveCopy,
    publishState,
    saveReducer,
    shellActions,
    statePill,
    statusLine,
    unsavedFields,
    wantsSave,
} from "./state";
import type { EditorCopy } from "./types";

const COPY: EditorCopy = {
    noun: "plan",
    liveLabel: "Open",
    liveClean: "Open to new sign-ups · no changes",
    draftSaved: "Draft · saved — nobody can join it yet",
    draftFirstSaved:
        "Saved as a draft — nobody can join it yet. Delete draft if you change your mind.",
    notStarted: "Not saved yet — start with a name",
    viewLabel: "View plan",
};

const DRAFT: RecordFacts = {
    status: "DRAFT",
    hasPendingChanges: false,
    canDelete: true,
};
const LIVE: RecordFacts = {
    status: "ACTIVE",
    hasPendingChanges: false,
    canDelete: false,
};
const CHANGES: RecordFacts = { ...LIVE, hasPendingChanges: true };
const ARCHIVED: RecordFacts = { ...LIVE, status: "ARCHIVED" };

function run(events: SaveEvent[], from = initialSave(4)): SaveState {
    return events.reduce(saveReducer, from);
}

function line(save: SaveState, record: RecordFacts | null, blocker = null) {
    return statusLine({
        save,
        record,
        copy: COPY,
        blocker,
        firstSave: false,
    });
}

describe("the save state machine", () => {
    it("goes idle → dirty → saving → saved, and leaving then asks nothing", () => {
        let s = initialSave(4);
        expect(s.phase).toBe("idle");
        expect(isSettled(s)).toBe(true);
        s = saveReducer(s, { type: "edit" });
        expect(s.phase).toBe("dirty");
        expect(wantsSave(s)).toBe(true);
        expect(isSettled(s)).toBe(false);
        s = saveReducer(s, { type: "send", seq: 1 });
        expect(s.phase).toBe("saving");
        expect(wantsSave(s)).toBe(false);
        s = saveReducer(s, { type: "saved", seq: 1, revision: 5 });
        expect(s.phase).toBe("saved");
        expect(s.revision).toBe(5);
        expect(isSettled(s)).toBe(true);
    });

    it("an edit made while a save is out keeps it saving, then dirty once that save lands", () => {
        const s = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            { type: "edit" },
        ]);
        expect(s.phase).toBe("saving");
        const after = saveReducer(s, { type: "saved", seq: 1, revision: 5 });
        expect(after.phase).toBe("dirty");
        expect(wantsSave(after)).toBe(true);
        expect(isSettled(after)).toBe(false);
    });

    it("a failed save says so, keeps the edits unsaved, and doesn't retry by itself", () => {
        const s = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            { type: "failed", seq: 1, error: "Couldn't reach Saroh" },
        ]);
        expect(s.phase).toBe("failed");
        expect(wantsSave(s)).toBe(false);
        expect(isSettled(s)).toBe(false);
        expect(s.error).toBe("Couldn't reach Saroh");
    });

    it("the next edit after a failure is the retry, and a success clears the failure", () => {
        const s = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            { type: "failed", seq: 1, error: "x", field: "price" },
            { type: "edit" },
        ]);
        expect(s.phase).toBe("dirty");
        expect(wantsSave(s)).toBe(true);
        const ok = run(
            [
                { type: "send", seq: 2 },
                { type: "saved", seq: 2, revision: 5 },
            ],
            s,
        );
        expect(ok.phase).toBe("saved");
        expect(ok.error).toBeNull();
        expect(ok.errorField).toBeNull();
        expect(ok.failedSeq).toBeNull();
    });

    it("Try again after a failure makes it dirty again", () => {
        const s = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            { type: "failed", seq: 1, error: "x" },
            { type: "retry" },
        ]);
        expect(s.phase).toBe("dirty");
        expect(wantsSave(s)).toBe(true);
    });

    it("never says Saved when an older payload succeeds after a newer one failed", () => {
        // Save 1 is slow; save 2 (newer) fails first; then save 1 lands.
        const s = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            { type: "edit" },
            { type: "send", seq: 2 },
            { type: "failed", seq: 2, error: "Couldn't reach Saroh" },
            { type: "saved", seq: 1, revision: 5 },
        ]);
        expect(s.phase).toBe("failed");
        expect(isSettled(s)).toBe(false);
        // Its revision still counts: the server did move on.
        expect(s.revision).toBe(5);
        expect(line(s, DRAFT).text).toMatch(/^Not saved/);
    });

    it("ignores an answer older than one already settled", () => {
        const s = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            { type: "edit" },
            { type: "send", seq: 2 },
            { type: "saved", seq: 2, revision: 6 },
        ]);
        const late = saveReducer(s, {
            type: "failed",
            seq: 1,
            error: "late",
        });
        expect(late).toBe(s);
        expect(late.phase).toBe("saved");
    });

    it("a conflict stops saving: edits stay on screen, nothing more is wanted until reset", () => {
        const s = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            {
                type: "conflict",
                conflict: {
                    changedBy: "Priya",
                    changedAt: null,
                    current: 5,
                },
            },
            { type: "edit" },
            { type: "edit" },
        ]);
        expect(s.phase).toBe("conflict");
        expect(s.edits).toBe(3);
        expect(wantsSave(s)).toBe(false);
        expect(saveReducer(s, { type: "send", seq: 3 })).toBe(s);
        expect(saveReducer(s, { type: "retry" })).toBe(s);
        expect(isSettled(s)).toBe(false);
        const reset = saveReducer(s, { type: "reset", revision: 5 });
        expect(reset.phase).toBe("idle");
        expect(reset.conflict).toBeNull();
        expect(reset.revision).toBe(5);
        expect(isSettled(reset)).toBe(true);
    });

    it("an answer still out when the screen was reset changes nothing", () => {
        const s = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            { type: "reset", revision: 7 },
        ]);
        const late = saveReducer(s, { type: "saved", seq: 1, revision: 6 });
        expect(late).toBe(s);
        expect(late.revision).toBe(7);
    });
});

describe("the record's publish state", () => {
    it("reads new, draft, live and live with changes", () => {
        expect(publishState(null)).toBe("new");
        expect(publishState(DRAFT)).toBe("draft");
        expect(publishState(LIVE)).toBe("live");
        expect(publishState(CHANGES)).toBe("changes");
        expect(publishState(ARCHIVED)).toBe("live");
    });

    it("pills Draft, Open, Changes not live and Archived, as the design draws them", () => {
        expect(statePill(null, COPY)).toEqual({ label: "Draft", tone: "off" });
        expect(statePill(DRAFT, COPY)).toEqual({ label: "Draft", tone: "off" });
        expect(statePill(LIVE, COPY)).toEqual({ label: "Open", tone: "ok" });
        expect(statePill(LIVE, { liveLabel: "On sale" }).label).toBe("On sale");
        expect(statePill(CHANGES, COPY)).toEqual({
            label: "Changes not live",
            tone: "accent",
        });
        expect(statePill(ARCHIVED, COPY)).toEqual({
            label: "Archived",
            tone: "off",
        });
    });
});

describe("the status line", () => {
    const saved = run([
        { type: "edit" },
        { type: "send", seq: 1 },
        { type: "saved", seq: 1, revision: 5 },
    ]);

    it("says the copy for each publish state once saved", () => {
        expect(line(initialSave(null), null).text).toBe(COPY.notStarted);
        expect(line(saved, DRAFT).text).toBe(COPY.draftSaved);
        expect(
            statusLine({
                save: saved,
                record: DRAFT,
                copy: COPY,
                blocker: null,
                firstSave: true,
            }).text,
        ).toBe(COPY.draftFirstSaved);
        expect(line(saved, CHANGES).text).toBe(
            "Unpublished changes · saved as a draft",
        );
        expect(line(saved, LIVE).text).toBe(COPY.liveClean);
        expect(line(saved, ARCHIVED).text).toBe("Archived · no changes");
    });

    it("says Saving… from the first keystroke until the server has it", () => {
        const typing = run([{ type: "edit" }]);
        expect(line(typing, LIVE)).toEqual({
            text: "Saving…",
            tone: "quiet",
            action: null,
        });
        const out = saveReducer(typing, { type: "send", seq: 1 });
        expect(line(out, LIVE).text).toBe("Saving…");
    });

    it("says why nothing can save yet, in red", () => {
        const s = run([{ type: "edit" }], initialSave(null));
        expect(
            statusLine({
                save: s,
                record: null,
                copy: COPY,
                blocker: "Add a name to save the draft",
                firstSave: false,
            }),
        ).toEqual({
            text: "Add a name to save the draft",
            tone: "danger",
            action: null,
        });
    });

    it("says Not saved with Try again after a failure", () => {
        const s = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            { type: "failed", seq: 1, error: "x" },
        ]);
        expect(line(s, LIVE)).toEqual({
            text: "Not saved — your changes are still here.",
            tone: "danger",
            action: "retry",
        });
    });

    it("names who changed it in a conflict, with Reload", () => {
        const s = run([
            {
                type: "conflict",
                conflict: { changedBy: "Priya", changedAt: null, current: 5 },
            },
        ]);
        const l = line(s, LIVE);
        expect(l.text).toMatch(/^Priya changed this plan/);
        expect(l.action).toBe("reload");
        expect(l.tone).toBe("danger");
        const nobody = run([
            {
                type: "conflict",
                conflict: { changedBy: null, changedAt: null, current: null },
            },
        ]);
        expect(line(nobody, LIVE).text).toMatch(
            /^Someone else changed this plan/,
        );
    });
});

describe("the header's actions", () => {
    const clean = initialSave(4);
    const saved = run([
        { type: "edit" },
        { type: "send", seq: 1 },
        { type: "saved", seq: 1, revision: 5 },
    ]);
    const act = (
        save: SaveState,
        record: RecordFacts | null,
        problems: { field: string; message: string }[] = [],
        busy = false,
    ) => shellActions({ save, record, problems, busy });

    it("offers Publish and Delete draft on a draft nobody has joined", () => {
        const a = act(saved, DRAFT);
        expect(a.publishLabel).toBe("Publish");
        expect(a.publishOn).toBe(true);
        expect(a.deleteDraft).toBe(true);
        expect(a.discard).toBe(false);
        expect(a.view).toBe(true);
    });

    it("hides Delete draft once the draft can't be deleted", () => {
        expect(act(saved, { ...DRAFT, canDelete: false }).deleteDraft).toBe(
            false,
        );
    });

    it("offers Publish changes and Discard changes on a live record with changes", () => {
        const a = act(saved, CHANGES);
        expect(a.publishLabel).toBe("Publish changes");
        expect(a.publishOn).toBe(true);
        expect(a.discard).toBe(true);
        expect(a.deleteDraft).toBe(false);
    });

    it("draws Publish changes off on a live record with nothing waiting, and says why", () => {
        const a = act(clean, LIVE);
        expect(a.publishOn).toBe(false);
        expect(a.discard).toBe(false);
        expect(a.publishWhy).toBe(
            "Nothing to publish yet — edits appear here as a draft first.",
        );
    });

    it("lets Publish changes go while an edit to a live record is still saving (it saves first)", () => {
        const typing = run([{ type: "edit" }]);
        expect(act(typing, LIVE).publishOn).toBe(true);
    });

    it("turns Publish off with the reason when something needs fixing", () => {
        const one = act(saved, DRAFT, [
            { field: "name", message: "Give it a name" },
        ]);
        expect(one.publishOn).toBe(false);
        expect(one.publishWhy).toBe(
            "1 thing to fix before publishing — give it a name.",
        );
        const two = act(saved, DRAFT, [
            { field: "name", message: "Give it a name" },
            { field: "price", message: "Add the price" },
        ]);
        expect(two.publishWhy).toBe(
            "2 things to fix before publishing — they're marked below.",
        );
    });

    it("gives no reason on a new, empty page: nothing is wrong yet", () => {
        const a = act(initialSave(null), null, [
            { field: "name", message: "Give it a name" },
        ]);
        expect(a.publishOn).toBe(false);
        expect(a.publishWhy).toBeNull();
        expect(a.view).toBe(false);
    });

    it("turns Publish off in a conflict and after a failed save", () => {
        const conflict = run([
            {
                type: "conflict",
                conflict: { changedBy: "Priya", changedAt: null, current: 5 },
            },
        ]);
        expect(act(conflict, CHANGES).publishOn).toBe(false);
        expect(act(conflict, CHANGES).publishWhy).toMatch(/^Reload/);
        const failed = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            { type: "failed", seq: 1, error: "x" },
        ]);
        expect(act(failed, CHANGES).publishOn).toBe(false);
        expect(act(failed, CHANGES).publishWhy).toMatch(/try again/);
    });

    it("turns Publish off while another action is out", () => {
        expect(act(saved, DRAFT, [], true).publishOn).toBe(false);
    });
});

describe("naming what would be lost", () => {
    const labels = { name: "name", price: "price", every: "billing" };

    it("names the fields that differ from what the server last took", () => {
        expect(
            unsavedFields(
                { name: "Monthly", price: "1200", every: "month" },
                { name: "Monthly", price: "1500", every: "year" },
                labels,
            ),
        ).toEqual(["price", "billing"]);
        expect(
            unsavedFields(
                { name: "A", price: "1", every: "month" },
                { name: "A", price: "1", every: "month" },
                labels,
            ),
        ).toEqual([]);
    });

    it("joins them in words", () => {
        expect(joinAnd([])).toBe("");
        expect(joinAnd(["price"])).toBe("price");
        expect(joinAnd(["name", "price"])).toBe("name and price");
        expect(joinAnd(["name", "price", "classes"])).toBe(
            "name, price and classes",
        );
    });

    it("words the leave dialog after a failed save", () => {
        const failed = run([
            { type: "edit" },
            { type: "send", seq: 1 },
            { type: "failed", seq: 1, error: "x" },
        ]);
        expect(
            leaveCopy({
                save: failed,
                fields: ["price", "name"],
                created: true,
                noun: "plan",
            }),
        ).toEqual({
            title: "Leave with unsaved changes?",
            body: "Your changes to price and name aren't saved, and will be lost if you leave now.",
        });
    });

    it("words it for a conflict, naming who", () => {
        const s = run([
            {
                type: "conflict",
                conflict: { changedBy: "Priya", changedAt: null, current: 5 },
            },
        ]);
        expect(
            leaveCopy({
                save: s,
                fields: ["price"],
                created: true,
                noun: "plan",
            }).body,
        ).toBe(
            "Priya changed this plan, so your changes to price aren't saved and will be lost.",
        );
    });

    it("words it for a record never created", () => {
        expect(
            leaveCopy({
                save: initialSave(null),
                fields: [],
                created: false,
                noun: "pack",
            }),
        ).toEqual({
            title: "Leave without saving it?",
            body: "Nothing you've entered is kept — the pack saves as a draft once it has a name.",
        });
    });
});
