"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var fems_client_exports = {};
__export(fems_client_exports, {
  FemsClient: () => FemsClient,
  isValidChannel: () => isValidChannel,
  validateChannels: () => validateChannels
});
module.exports = __toCommonJS(fems_client_exports);
var import_axios = __toESM(require("axios"));
var import_types = require("./types");
const ADDRESS_PATTERN = /^[^/]+\/[^/]+$/;
function isValidChannel(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const channel = value;
  return typeof channel.address === "string" && ADDRESS_PATTERN.test(channel.address) && (0, import_types.isFemsValueType)(channel.type) && (0, import_types.isFemsAccessMode)(channel.accessMode) && typeof channel.text === "string" && typeof channel.unit === "string";
}
function validateChannels(data) {
  const entries = Array.isArray(data) ? data : [data];
  const valid = [];
  const rejected = [];
  for (const entry of entries) {
    if (isValidChannel(entry)) {
      valid.push(entry);
    } else {
      const address = typeof entry === "object" && entry !== null && "address" in entry ? String(entry.address) : JSON.stringify(entry);
      rejected.push(`invalid channel: ${address}`);
    }
  }
  return { valid, rejected };
}
class FemsClient {
  logger;
  endpoints;
  apiClient;
  /**
   * Creates a new client.
   *
   * @param options - Client options
   * @param apiClient - Optional axios instance, mainly used for testing
   */
  constructor(options, apiClient) {
    this.logger = options.logger;
    this.endpoints = options.endpoints ?? [];
    this.apiClient = apiClient ?? import_axios.default.create({
      baseURL: `http://x:owner@${options.ipAddress}/rest/channel/`,
      timeout: options.timeout ?? 5e3,
      responseType: "json",
      responseEncoding: "utf8"
    });
    this.logger.debug("[FemsClient] axios instance successful created.");
  }
  /**
   * Loads all configured channels from the FEMS box.
   *
   * Invalid entries are dropped and logged once, so that a broken response
   * (for example an HTML error page) never creates nonsense states.
   *
   * @returns All valid channel values of the requested endpoints, or an empty array in case of errors
   */
  async loadChannels() {
    this.logger.debug("[loadChannels] Load data from FEMS.");
    const channels = [];
    if (this.endpoints.length === 0) {
      const response = await this.requestChannel(".*/.*");
      if (response !== null) {
        channels.push(...response);
      }
    } else {
      const responses = await Promise.all(this.buildEndpointRequests());
      for (const response of responses) {
        if (response !== null) {
          channels.push(...response);
        }
      }
    }
    this.logger.silly(() => `[loadChannels] combined response: ${JSON.stringify(channels)}`);
    return channels;
  }
  /**
   * Builds all requests for the configured endpoints.
   *
   * @returns One promise per endpoint request
   */
  buildEndpointRequests() {
    const requests = [];
    for (const endpoint of this.endpoints) {
      const channelIds = (endpoint.channelId || "").split(";").map((channelId) => channelId.trim()).filter((channelId) => !!channelId);
      for (const channelId of channelIds) {
        requests.push(this.requestChannel(`${endpoint.componentId}/${channelId}`));
      }
    }
    return requests;
  }
  /**
   * Requests a single endpoint. Errors are logged and swallowed, so that a
   * single broken endpoint does not break the whole update.
   *
   * @param path - Path relative to the REST base url, e.g. `_sum/SoC`
   * @returns The channels of the endpoint or `null` in case of an error
   */
  async requestChannel(path) {
    try {
      const response = await this.apiClient.get(path);
      if (response.status !== 200) {
        return null;
      }
      const { valid, rejected } = validateChannels(response.data);
      if (rejected.length > 0) {
        this.logger.error(
          `[requestChannel] Dropped ${rejected.length} invalid entries of ${path}: ${rejected.slice(0, 5).join(", ")}${rejected.length > 5 ? ", \u2026" : ""}`
        );
      }
      return valid;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[requestChannel] Error for endpoint ${path}: ${message}`);
      return null;
    }
  }
  /**
   * Writes a value to a single FEMS channel.
   *
   * The OpenEMS REST API expects a `POST` request to the channel url with a
   * JSON body of the form `{ "value": <value> }`.
   *
   * @param address - Channel address relative to the REST base url, e.g. `ess0/SetActivePowerEquals`
   * @param value - Value to write
   * @returns `true` if the write succeeded
   */
  async writeChannel(address, value) {
    if (!ADDRESS_PATTERN.test(address)) {
      this.logger.error(`[writeChannel] Invalid channel address: ${address}`);
      return false;
    }
    try {
      const response = await this.apiClient.post(address, { value });
      if (response.status >= 200 && response.status < 300) {
        this.logger.debug(() => `[writeChannel] ${address} set to ${JSON.stringify(value)}`);
        return true;
      }
      this.logger.error(`[writeChannel] ${address} failed with status ${response.status}`);
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[writeChannel] Error for ${address}: ${message}`);
      return false;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FemsClient,
  isValidChannel,
  validateChannels
});
//# sourceMappingURL=fems-client.js.map
