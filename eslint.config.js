import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "build/**", ".venv/**", "design/**", "node_modules/**", ".wrangler/**", "playwright-report/**", "test-results/**", "src/lib/icons.generated.ts"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
