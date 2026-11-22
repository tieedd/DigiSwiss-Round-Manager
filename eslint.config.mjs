import tsParser from '@typescript-eslint/parser';
import hooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': hooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
