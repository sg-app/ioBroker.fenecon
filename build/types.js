"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var types_exports = {};
__export(types_exports, {
  FEMS_ACCESS_MODES: () => FEMS_ACCESS_MODES,
  FEMS_VALUE_TYPES: () => FEMS_VALUE_TYPES,
  isFemsAccessMode: () => isFemsAccessMode,
  isFemsValueType: () => isFemsValueType
});
module.exports = __toCommonJS(types_exports);
const FEMS_VALUE_TYPES = ["INTEGER", "LONG", "DOUBLE", "FLOAT", "BOOLEAN", "STRING"];
const FEMS_ACCESS_MODES = ["RO", "RW", "WO"];
function isFemsValueType(value) {
  return typeof value === "string" && FEMS_VALUE_TYPES.includes(value);
}
function isFemsAccessMode(value) {
  return typeof value === "string" && FEMS_ACCESS_MODES.includes(value);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FEMS_ACCESS_MODES,
  FEMS_VALUE_TYPES,
  isFemsAccessMode,
  isFemsValueType
});
//# sourceMappingURL=types.js.map
