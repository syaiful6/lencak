const config = require("./webpack.config.js");
const webpack = require("webpack");
const UglifyWebpackPlugin = require("uglifyjs-webpack-plugin");
const CompressionPlugin = require("compression-webpack-plugin");


config.mode = "production";
config.plugins.push(new webpack.DefinePlugin({
  "process.env": { NODE_ENV: JSON.stringify("production") }
}));

config.plugins.push(new UglifyWebpackPlugin({
  sourceMap: false
}));

config.plugins.push(new CompressionPlugin({
  asset: "[path].gz[query]",
  algorithm: "gzip",
  test: /\.js$|\.ts$|\.css$|\.html$/,
  threshold: 10240,
  minRatio: 0
}));

module.exports = config;
