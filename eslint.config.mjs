import frontendConfig from "./frontend-escolar/eslint.config.mjs";

export default [
  {
    ignores: [
      "backend/**",
      "frontend-escolar/.next/**",
      "frontend-escolar/node_modules/**",
      "frontend-escolar/out/**",
      "frontend-escolar/build/**",
      "*.log",
    ],
  },
  {
    settings: {
      next: {
        rootDir: "frontend-escolar/",
      },
    },
  },
  ...frontendConfig,
  {
    files: ["frontend-escolar/components/layout/sidebar.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
      "prefer-const": "off",
    },
  },
];
