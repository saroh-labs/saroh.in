import config from "@saroh/eslint-config/base";

export default [
    ...config,
    {
        files: ["**/*.ts"],
        rules: {
            // A project is compared by prefix. @serial specs run in
            // "desk-serial" and "phone-serial", so `name === "phone"` is
            // never true there and the phone checks it guards never run
            // (release review, module-turn-on.spec.ts; DEV_LEARNINGS).
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "BinaryExpression[operator=/^[!=]==?$/]:matches([left.value=/^(desk|phone)$/], [right.value=/^(desk|phone)$/])",
                    message:
                        'Compare a project by prefix: project.name.startsWith("phone") (or "desk") also matches its "-serial" project, where @serial specs run.',
                },
            ],
        },
    },
];
