import baseConfig from "@saroh/eslint-config/base";
import reactConfig from "@saroh/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
    { ignores: ["dist/**"] },
    ...baseConfig,
    ...reactConfig,
    {
        rules: {
            // Component-library primitives forward untyped props via spreads;
            // the type-aware base is otherwise applied in full.
            "no-redeclare": "off",
        },
    },
];
