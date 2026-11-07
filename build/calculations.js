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
var calculations_exports = {};
__export(calculations_exports, {
  calculateAutarchy: () => calculateAutarchy,
  calculateSelfConsumption: () => calculateSelfConsumption
});
module.exports = __toCommonJS(calculations_exports);
function calculateAutarchy(gridActivePower, consumptionActivePower) {
  if (gridActivePower === null || consumptionActivePower === null || consumptionActivePower <= 0) {
    return null;
  }
  return Math.round(Math.max(0, Math.min(100, (1 - gridActivePower / consumptionActivePower) * 100)));
}
function calculateSelfConsumption(gridActivePower, productionActivePower) {
  if (productionActivePower === null || productionActivePower <= 0) {
    return null;
  }
  const sellToGrid = gridActivePower === null ? 0 : -gridActivePower;
  const selfConsumption = (1 - sellToGrid / productionActivePower) * 100;
  return Math.max(0, Math.min(100, Math.floor(selfConsumption)));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  calculateAutarchy,
  calculateSelfConsumption
});
//# sourceMappingURL=calculations.js.map
