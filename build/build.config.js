const path = require("path")
const fs = require("fs")

// -- Webpack configuration --

const config = {}

// Application entry point
config.entry = "./src/index.js"

// We build for node
config.target = "node"

// Node module dependencies should not be bundled
config.externals = fs.readdirSync("node_modules")
  .reduce(function(acc, mod) {
    if (mod === ".bin") {
      return acc
    }

    acc[mod] = "commonjs " + mod
    return acc
  }, {})

// We are outputting a real node app!
config.node = {
  console: false,
  global: false,
  process: false,
  Buffer: false,
  __filename: false,
  __dirname: false,
}

// Output files in the build/ folder
config.output = {
  path: path.join(__dirname, "build"),
  filename: "[name].js",
  library: 'MapitoKnDown',
  libraryTarget: 'commonjs',
}

config.resolve = {
  extensions: [
    // "",
    ".js",
    ".json",
  ],
}

config.module = {}

config.module.rules = [

  {
          test : /\.js$/,
          exclude: /(node_modules)/,
          use: {
            loader: 'babel-loader',
            options: {
                cacheDirectory: true
            },
          },
          exclude: /node_modules(?!\/webpack-dev-server)/ ,
        },
]

module.exports = config
