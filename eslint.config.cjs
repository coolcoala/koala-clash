const js = require('@eslint/js')
const react = require('eslint-plugin-react')
const { configs } = require('@electron-toolkit/eslint-config-ts')

module.exports = [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/extra/**']
  },

  js.configs.recommended,
  ...configs.recommended,

  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: react
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    languageOptions: {
      ...react.configs.recommended.languageOptions
    }
  },

  {
    files: ['**/*.cjs', '**/*.mjs', '**/tailwind.config.js', '**/postcss.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 0,
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/prop-types': 'off'
    }
  }
]
