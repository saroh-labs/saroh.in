import config from "@saroh/eslint-config/base";

// A project is compared by prefix. @serial specs run in "desk-serial" and
// "phone-serial", so `name === "phone"` is never true there and the phone
// checks it guards never run (release review, module-turn-on.spec.ts;
// DEV_LEARNINGS). The same holds for a template literal, a cast literal,
// `["phone"].includes(name)` and `switch (name) { case "phone": }`.
const PREFIX =
    'Compare a project by prefix: project.name.startsWith("phone") (or "desk") also matches its "-serial" project, where @serial specs run.';

/** `<field>` is an expression ending in `.project.name`. */
const PROJECT_NAME = (field) =>
    `[${field}.type='MemberExpression'][${field}.property.name='name'][${field}.object.property.name='project']`;

/** `<field>` is the literal "desk" or "phone", bare or cast with `as`. */
const DESK_OR_PHONE = (field) =>
    `:matches([${field}.value=/^(desk|phone)$/], [${field}.type='TSAsExpression'][${field}.expression.value=/^(desk|phone)$/])`;

export default [
    ...config,
    {
        files: ["**/*.ts"],
        rules: {
            "no-restricted-syntax": [
                "error",
                // Matched on the expression ending in `project.name`, so the
                // literal's spelling (quoted, a template, cast with `as`)
                // doesn't hide one. A plain literal other than "desk" or
                // "phone" (such as "phone-serial") is a deliberate exact
                // compare and stays allowed.
                {
                    selector: `BinaryExpression[operator=/^[!=]==?$/]:matches(${PROJECT_NAME("left")}:not([right.type='Literal']), ${PROJECT_NAME("right")}:not([left.type='Literal']))`,
                    message: PREFIX,
                },
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
            ],
        },
    },
];
