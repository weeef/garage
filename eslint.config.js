// npm run lint. Catches real mistakes (undefined names, unused code) rather than enforcing style.
const browser = ['window', 'document', 'localStorage', 'navigator', 'location', 'fetch', 'matchMedia', 'requestAnimationFrame',
  'cancelAnimationFrame', 'performance', 'ResizeObserver', 'IntersectionObserver', 'structuredClone', 'crypto', 'URL', 'URLSearchParams',
  'AbortController', 'Event', 'File', 'Blob', 'self', 'caches', 'Request', 'Response', 'getComputedStyle'];
const node = ['require', 'module', 'process', '__dirname', 'Buffer', 'global', 'globalThis'];
const common = ['console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Proxy'];
const globals = (names) => Object.fromEntries(names.map((n) => [n, 'readonly']));

module.exports = [
  { ignores: ['node_modules/', 'dist/', 'mobile/lib/', 'lib/vendor/'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals(browser), ...globals(node), ...globals(common), module: 'writable' }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'error',
      eqeqeq: ['error', 'smart']
    }
  }
];
