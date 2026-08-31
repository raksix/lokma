// Minimal ESLint config — full rules in Phase 1
export default [
  { ignores: ['node_modules', 'dist', '.next', '.turbo', 'coverage'] },
  {
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
];
