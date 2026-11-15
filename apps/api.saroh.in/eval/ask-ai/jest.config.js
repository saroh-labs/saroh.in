/**
 * The quality test's own unit specs (grader, figures, budget): no database,
 * no provider. Kept apart from the API's unit project so its config stays
 * as it is:
 *
 *     pnpm --filter @saroh/api exec jest -c eval/ask-ai/jest.config.js
 *
 * @type {import('jest').Config}
 */
module.exports = {
    rootDir: __dirname,
    testMatch: ["<rootDir>/**/*.spec.ts"],
    testEnvironment: "node",
    watchman: false,
    transform: {
        "^.+\\.ts$": ["ts-jest", { tsconfig: `${__dirname}/tsconfig.json` }],
    },
};
