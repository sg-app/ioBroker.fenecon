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
var state_factory_exports = {};
__export(state_factory_exports, {
  buildChannelObject: () => buildChannelObject,
  buildStateObject: () => buildStateObject,
  convertToFemsValue: () => convertToFemsValue,
  convertValue: () => convertValue,
  isWritable: () => isWritable,
  name2id: () => name2id,
  resolveRole: () => resolveRole,
  resolveRoleWithSource: () => resolveRoleWithSource,
  toBooleanValue: () => toBooleanValue,
  typeTranslation: () => typeTranslation,
  unitScaleFactor: () => unitScaleFactor,
  unitToRole: () => unitToRole
});
module.exports = __toCommonJS(state_factory_exports);
var import_states = require("./states");
function name2id(name, forbiddenChars) {
  return (name || "").replace(forbiddenChars, "_");
}
function typeTranslation(inType) {
  switch (inType) {
    case "INTEGER":
    case "LONG":
    case "DOUBLE":
    case "FLOAT":
      return "number";
    case "BOOLEAN":
      return "boolean";
    case "STRING":
      return "string";
    default:
      throw new Error(`[typeTranslation] Unknown FEMS type: ${inType}`);
  }
}
function resolveRole(address) {
  const definition = import_states.statesByAddress.get(address);
  return definition?.role ?? "state";
}
function resolveRoleWithSource(address, unit) {
  const definition = import_states.statesByAddress.get(address);
  if (definition) {
    return { role: definition.role, known: true };
  }
  return { role: unitToRole(unit), known: false };
}
function unitToRole(unit) {
  const unitRoles = {
    V: "value.voltage",
    mV: "value.voltage",
    A: "value.current",
    mA: "value.current",
    W: "value.power",
    VA: "value.power",
    var: "value.power.reactive",
    Wh: "value.energy",
    Wh_\u03A3: "value.energy",
    kWh: "value.energy",
    "\u20AC/MWh": "value",
    Hz: "value.frequency",
    mHz: "value.frequency",
    "\xB0C": "value.temperature",
    dC: "value.temperature",
    C: "value.temperature",
    ms: "time.span",
    s: "time.span",
    sec: "time.span",
    sec_\u03A3: "time.span",
    "%": "value",
    "\u2030": "value"
  };
  return unitRoles[unit] ?? "value";
}
function unitScaleFactor(unit) {
  return unit === "dC" ? 0.1 : 1;
}
function convertValue(value, unit) {
  const factor = unitScaleFactor(unit);
  if (factor === 1 || typeof value !== "number") {
    return value;
  }
  return value * factor;
}
function convertToFemsValue(value, unit) {
  const factor = unitScaleFactor(unit);
  if (factor === 1 || typeof value !== "number") {
    return value;
  }
  return value / factor;
}
function buildChannelObject(channelName) {
  return {
    _id: channelName,
    type: "channel",
    common: {
      name: channelName
    },
    native: {}
  };
}
function buildStateObject(stateName, channel) {
  return {
    type: "state",
    common: {
      name: stateName,
      desc: channel.text,
      role: resolveRoleWithSource(channel.address, channel.unit).role,
      // Only RW and WO channels may be written back to FEMS.
      write: channel.accessMode === "RW" || channel.accessMode === "WO",
      read: channel.accessMode === "RO" || channel.accessMode === "RW",
      type: typeTranslation(channel.type),
      unit: channel.unit
    },
    native: {}
  };
}
function isWritable(accessMode) {
  return accessMode === "RW" || accessMode === "WO";
}
function toBooleanValue(value) {
  return !!value;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildChannelObject,
  buildStateObject,
  convertToFemsValue,
  convertValue,
  isWritable,
  name2id,
  resolveRole,
  resolveRoleWithSource,
  toBooleanValue,
  typeTranslation,
  unitScaleFactor,
  unitToRole
});
//# sourceMappingURL=state-factory.js.map
