const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

module.exports = [
  // Main process
  {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    entry: './src/main/main.ts',
    target: 'electron-main',
    module: {
      rules: [{
        test: /\.ts$/,
        include: /src/,
        use: [{ loader: 'ts-loader' }]
      }]
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    externals: {
      jsdom: 'commonjs jsdom',
      turndown: 'commonjs turndown',
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: 'main.js'
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'assets', to: 'assets' }
        ]
      })
    ]
  },
  // Preload script
  {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    entry: './src/main/preload.ts',
    target: 'electron-preload',
    module: {
      rules: [{
        test: /\.ts$/,
        include: /src/,
        use: [{ loader: 'ts-loader' }]
      }]
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: 'preload.js'
    }
  },
  // Renderer process
  {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    entry: './src/renderer/index.tsx',
    target: 'web',
    devtool: 'source-map',
    module: {
      rules: [
        {
          test: /\.ts(x?)$/,
          include: /src/,
          use: [{ loader: 'ts-loader' }]
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset/resource'
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.ts', '.tsx'],
      alias: {
        '@components': path.resolve(__dirname, 'src/renderer/components'),
        '@hooks': path.resolve(__dirname, 'src/renderer/hooks'),
        '@contexts': path.resolve(__dirname, 'src/renderer/contexts'),
        '@utils': path.resolve(__dirname, 'src/renderer/utils'),
      },
      fallback: {
        path: false,
        fs: false,
        url: false,
        process: false
      }
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: 'renderer.js'
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/renderer/index.html'
      })
    ]
  }
];
