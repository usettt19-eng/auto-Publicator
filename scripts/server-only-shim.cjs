// "server-only" lanza un error fuera del bundler de Next. El worker es código de
// servidor por definición, así que lo resolvemos a un módulo vacío.
const Module = require("node:module");
const empty = require.resolve("./empty-module.cjs");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === "server-only" ? empty : resolve.call(this, request, ...rest);
};
