const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { DefinePlugin } = require('webpack');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/services/aiwm'),
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
    new DefinePlugin({
      // Baked in at build time via LICENSE_SECRET env var.
      // In development leave empty — guard falls back to unsigned LICENSE_EXPIRY.
      __LICENSE_SECRET__: JSON.stringify(process.env.LICENSE_SECRET || ''),
    }),
  ],
};
