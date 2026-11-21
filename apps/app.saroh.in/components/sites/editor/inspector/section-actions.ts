import { SECTION_LABELS } from "../editor-constants";
import type { EditorModel } from "../shell/editor-model";
import { duplicateOf, withFrame } from "./section-frame";

/**
 * The section actions the inspector and the canvas toolbar share (U47),
 * each at once with Undo (G3): Duplicate puts a copy below and selects it;
 * Hide on phone sets the frame's `hideOn`. Move, Hide and Delete are
 * `model.edits`' own.
 */
export function sectionActions({ draft, edits }: EditorModel) {
    const { sections } = draft;
    return {
        duplicate(index: number) {
            if (index < 0 || index >= sections.length) return;
            const section = sections[index];
            edits.changeWithUndo(
                `${SECTION_LABELS[section.type]} duplicated`,
                [
                    ...sections.slice(0, index + 1),
                    duplicateOf(section),
                    ...sections.slice(index + 1),
                ],
                { after: index + 1, undone: index },
            );
        },
        hideOnPhone(index: number, hide: boolean) {
            if (index < 0 || index >= sections.length) return;
            const section = sections[index];
            edits.changeWithUndo(
                hide
                    ? `${SECTION_LABELS[section.type]} is hidden on phones`
                    : `${SECTION_LABELS[section.type]} is back on phones`,
                sections.map((s, i) =>
                    i === index
                        ? withFrame(s, { hideOn: hide ? "phone" : undefined })
                        : s,
                ),
            );
        },
    };
}
