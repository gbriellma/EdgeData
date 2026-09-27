// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// hyparquet e hyparquet-writer (Parquet em JS puro) expõem por padrão uma entrada
// para Node que importa `fs`. No app usamos a entrada "browser", sem dependências do Node.
const BROWSER_ENTRY_PACKAGES = new Set(['hyparquet', 'hyparquet-writer']);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (BROWSER_ENTRY_PACKAGES.has(moduleName)) {
    return context.resolveRequest({ ...context, unstable_conditionNames: ['browser', 'import', 'default'] }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
