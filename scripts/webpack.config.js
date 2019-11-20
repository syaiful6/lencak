
/* global __dirname */
const path = require('path');
const ExtractTextPlugin = require('extract-text-webpack-plugin');

module.exports = {

  context: path.resolve(__dirname, "../browser"),

  entry: {
    index: "./app/index.ts",
  },

  output: {
    path: path.resolve(__dirname, "../browser/dist"),
    filename: "js/[name].js"
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json'],
  },

  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        loader: 'ts-loader',
      },
      {
        test: /\.css$/,
        use: ExtractTextPlugin.extract({
          fallback: "style-loader",
          use: "css-loader"
        })
      }
    ]
  },

  plugins: [
    new ExtractTextPlugin("css/app.css"),
  ],

  devtool: "source-map"

};
