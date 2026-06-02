/** @type {import('jest').Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    rootDir: "src",
    testRegex: ".*\\.spec\\.ts$",
    moduleFileExtensions: ["ts", "js", "json"],
};
