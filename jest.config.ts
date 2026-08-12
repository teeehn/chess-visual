import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Default testMatch treats any .ts(x) under __tests__/ as a suite, which
  // picks up shared helpers like __tests__/test-utils.ts. Scope to actual
  // test files instead.
  testMatch: ["<rootDir>/__tests__/**/*.test.[jt]s?(x)"],
};

export default createJestConfig(config);
