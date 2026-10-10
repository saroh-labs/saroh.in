import { RAW_ALLOWED } from "./controls-allowlist.js";

/**
 * The shared controls are the only controls.
 *
 * App code draws a button, a field, a select and a label with the primitives
 * in `@saroh/ui` (`Button`, `Input`, `Textarea`, `OptionSelect`, `Label`,
 * `Field`), so every screen gets the same sizes, states, touch targets and
 * 16px touch text without asking for them. A hand-made one is how a screen
 * ends up with its own height, its own disabled look and no busy state.
 *
 * Three rules, for app code outside `packages/ui`:
 *
 * 1. No raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<label>`.
 *    A control that is not a button in the shared sense (a row that is one,
 *    a chip, a tab, a segmented choice, a file picker) is listed by file in
 *    `controls-allowlist.js` with what it is. Add a line there only for a
 *    control of that kind, never to skip the primitive.
 * 2. No `disabled:opacity-*`. Disabled is the disabled tokens
 *    (`bg-disabled`, `text-disabled-foreground`, `border-disabled-border`),
 *    which the primitives already carry. A fade takes the label under
 *    contrast and reads as "loading".
 * 3. No `focus:ring*` or `focus:outline*`. A ring is for the keyboard:
 *    `focus-visible:`. A mouse click paints none.
 *
 * Use: `...controlsConfig({ root: import.meta.dirname })` in an app's
 * `eslint.config.mjs`, after the shared configs.
 */

const RAW_TAGS = ["button", "input", "select", "textarea", "label"];

const USE_INSTEAD = {
    button: 'Use Button from @saroh/ui/button (size="icon" with an aria-label for an icon, variant="link" size="inline" for a text action).',
    input: "Use Input from @saroh/ui/input (MoneyInput for an amount, Checkbox, RadioGroup or Switch for a tick or a choice).",
    select: "Use OptionSelect from @saroh/ui/option-select.",
    textarea: "Use Textarea from @saroh/ui/textarea.",
    label: "Use Field from @saroh/ui/field (label, hint and error wired to the control), or Label from @saroh/ui/label.",
};

const rawElement = (tag) => ({
    selector: `JSXOpeningElement[name.name='${tag}']`,
    message: `No raw <${tag}> in app code. ${USE_INSTEAD[tag]} If this is a different kind of control (a row, a chip, a tab), list the file in tooling/eslint-config-custom/controls-allowlist.js.`,
});

const FADE = "disabled:opacity-";
const FADE_MESSAGE =
    "No disabled:opacity-*. Disabled is the disabled tokens (bg-disabled, text-disabled-foreground, border-disabled-border), never a fade.";
// `focus:` at the start of a class, not `group-focus:` or `focus-visible:`.
const FOCUS = "(^|\\s)focus:(ring|outline)";
const FOCUS_MESSAGE =
    "No focus:ring* or focus:outline*. Use focus-visible: so only the keyboard paints a ring.";

const classRules = [
    { selector: `Literal[value=/${FADE}/]`, message: FADE_MESSAGE },
    { selector: `TemplateElement[value.raw=/${FADE}/]`, message: FADE_MESSAGE },
    { selector: `Literal[value=/${FOCUS}/]`, message: FOCUS_MESSAGE },
    {
        selector: `TemplateElement[value.raw=/${FOCUS}/]`,
        message: FOCUS_MESSAGE,
    },
];

/**
 * @param {{ allowed?: Record<string, readonly string[]> }} [options]
 *   `allowed` maps a file (relative to the app) to the raw tags it may keep.
 */
export function controlsConfig({ allowed = RAW_ALLOWED } = {}) {
    const blocks = [
        {
            files: ["**/*.tsx", "**/*.ts"],
            ignores: ["**/*.test.tsx", "**/*.test.ts", "**/test-kit.tsx"],
            rules: {
                "no-restricted-syntax": [
                    "error",
                    ...RAW_TAGS.map(rawElement),
                    ...classRules,
                ],
            },
        },
    ];
    // One block per distinct set of kept tags, so the list stays per file
    // and a file never keeps more than it names.
    const bySet = new Map();
    for (const [file, tags] of Object.entries(allowed)) {
        const key = [...tags].sort().join(",");
        if (!bySet.has(key)) bySet.set(key, []);
        bySet.get(key).push(file);
    }
    for (const [key, files] of bySet) {
        const kept = new Set(key.split(","));
        blocks.push({
            files,
            rules: {
                "no-restricted-syntax": [
                    "error",
                    ...RAW_TAGS.filter((t) => !kept.has(t)).map(rawElement),
                    ...classRules,
                ],
            },
        });
    }
    return blocks;
}

export default controlsConfig();
