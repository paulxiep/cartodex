// ESLint flat config. TypeScript-aware linting over the engine + app + scripts, on top
// of the strict tsc gate. Fast (non type-checked) recommended rules.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/**', 'public/data/**', 'deploy/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
)
