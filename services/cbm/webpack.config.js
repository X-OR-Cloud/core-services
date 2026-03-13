const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = [
  // Main API server
  {
    output: {
      path: join(__dirname, '../../dist/services/cbm'),
      filename: 'main.js',
      ...(process.env.NODE_ENV !== 'production' && {
        devtoolModuleFilenameTemplate: '[absolute-resource-path]',
      }),
    },
    plugins: [
      new NxAppWebpackPlugin({
        target: 'node',
        compiler: 'tsc',
        main: './src/main.ts',
        tsConfig: './tsconfig.app.json',
        assets: ['./src/assets'],
        optimization: false,
        outputHashing: 'none',
        generatePackageJson: true,
        sourceMaps: true,
      }),
    ],
  },
  // KB Worker process
  {
    output: {
      path: join(__dirname, '../../dist/services/cbm'),
      filename: 'kb-worker.js',
      ...(process.env.NODE_ENV !== 'production' && {
        devtoolModuleFilenameTemplate: '[absolute-resource-path]',
      }),
    },
    plugins: [
      new NxAppWebpackPlugin({
        target: 'node',
        compiler: 'tsc',
        main: './src/bootstrap-kb-worker.ts',
        tsConfig: './tsconfig.app.json',
        optimization: false,
        outputHashing: 'none',
        generatePackageJson: false,
        sourceMaps: true,
      }),
    ],
  },
];
