// Metro config: lets the bundler see @kup/shared, which lives outside this
// project (../../packages/shared) and is linked via "file:" (a symlink).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
// Shared code has no node_modules of its own: resolve everything from the app.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.extraNodeModules = { '@kup/shared': sharedRoot };
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
