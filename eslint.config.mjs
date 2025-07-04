import prettier from "eslint-plugin-prettier";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["**/node_modules"],
}, ...compat.extends("prettier", "eslint:recommended"), {
    plugins: {
        prettier,
    },

    languageOptions: {
        globals: {
            ...globals.serviceworker,
            ...globals.worker,
            ...globals.mocha,
        },

        ecmaVersion: "latest",
        sourceType: "module",
    },

    rules: {
        "prettier/prettier": ["error"],
    },
}];
