export default {
  displayName: 'iam',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // uuid v13+ and other transitive ESM-only packages must be transformed by ts-jest
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid)/)',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/services/iam',
};
