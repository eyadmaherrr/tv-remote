// The app shares pure TypeScript with the website (voice parser, app shortcuts, SmartThings
// key map) straight from ../src/lib, so Metro has to watch that folder too. Those files import
// nothing, so they never pull packages from the website's node_modules.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "..", "src", "lib")];

module.exports = config;
