import config from "@saroh/eslint-config/base";

// A project is compared by prefix. @serial specs run in "desk-serial" and
// "phone-serial", so `name === "phone"` is never true there and the phone
// checks it guards never run (release review, module-turn-on.spec.ts;
// DEV_LEARNINGS). The same holds for a template literal, a cast literal,
// `["phone"].includes(name)`, `switch (name) { case "phone": }` and an
// anchored regex such as `/^phone$/.test(name)`.
//
// Pinned by `eslint.config.test.mjs` (run with `pnpm lint`).
const PREFIX =
    'Compare a project by prefix: project.name.startsWith("phone") (or "desk") also matches its "-serial" project, where @serial specs run.';

/**
 * `<field>` is `project.name`: bare (a destructured `{ project }`) or the
 * end of a longer expression (`testInfo.project.name`).
 */
const PROJECT_NAME = (field) =>
    `[${field}.type='MemberExpression'][${field}.property.name='name']:matches([${field}.object.name='project'], [${field}.object.property.name='project'])`;

/**
 * `<field>` is the exact string "desk" or "phone": a literal, a template
 * with nothing interpolated, or either cast with `as`.
 */
const DESK_OR_PHONE = (field) =>
    `:matches(` +
    [
        `[${field}.value=/^(desk|phone)$/]`,
        `[${field}.type='TemplateLiteral'][${field}.expressions.length=0][${field}.quasis.0.value.cooked=/^(desk|phone)$/]`,
        `[${field}.type='TSAsExpression'][${field}.expression.value=/^(desk|phone)$/]`,
        `[${field}.type='TSAsExpression'][${field}.expression.type='TemplateLiteral'][${field}.expression.expressions.length=0][${field}.expression.quasis.0.value.cooked=/^(desk|phone)$/]`,
    ].join(", ") +
    `)`;

/** `<field>` is a regex literal anchored at its end: an exact match. */
const ANCHORED_REGEX = (field) => `[${field}.regex.pattern=/\\$$/]`;

const PROJECT_NAME_RULES = [
    // An equality with "desk" or "phone", whatever the other side: a
    // destructured `name` is as wrong as `project.name`. Anything else
    // (`project.name === other`, "phone-serial") is a deliberate exact
    // compare and stays allowed.
    {
        selector: `BinaryExpression[operator=/^[!=]==?$/]:matches(${DESK_OR_PHONE("left")}, ${DESK_OR_PHONE("right")})`,
        message: PREFIX,
    },
    {
        selector: `CallExpression[callee.property.name=/^(includes|indexOf)$/]${PROJECT_NAME("arguments.0")}`,
        message: PREFIX,
    },
    {
        selector: `SwitchStatement${PROJECT_NAME("discriminant")}`,
        message: PREFIX,
    },
    {
        selector: `CallExpression[callee.property.name=/^(test|exec)$/]${ANCHORED_REGEX("callee.object")}${PROJECT_NAME("arguments.0")}`,
        message: PREFIX,
    },
    {
        selector: `CallExpression[callee.property.name=/^(match|search)$/]${PROJECT_NAME("callee.object")}${ANCHORED_REGEX("arguments.0")}`,
        message: PREFIX,
    },
];

export default [
    ...config,
    {
        files: ["**/*.ts"],
        rules: {
            "no-restricted-syntax": ["error", ...PROJECT_NAME_RULES],
        },
    },
];
