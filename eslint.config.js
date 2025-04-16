// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      'semi': ['error', 'never'],
      'space-before-function-paren': ['error', 'always'],
      'object-curly-spacing': ['error', 'always']
    }
  }
)