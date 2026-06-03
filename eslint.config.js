// Raycast uses ESLint 9 flat config. The @raycast/eslint-config package (CJS)
// exports an array that contains nested arrays, so we wrap it in defineConfig
// from "eslint/config", which flattens them (as in the Raycast template).
const { defineConfig } = require("eslint/config");
const raycastConfig = require("@raycast/eslint-config");

module.exports = defineConfig([...raycastConfig, { ignores: ["dist/", "raycast-env.d.ts"] }]);
