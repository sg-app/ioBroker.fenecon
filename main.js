"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const axios = require("axios");
const States = require("./lib/states")

let createdChannel = [];
let createdState = [];

class Fenecon extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "fenecon",
		});

		this.on("ready", this.onReady.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		try {

			// The adapters config (in the instance object everything under the attribute "native") is accessible via
			if (!this.config.ipAddress) {
				this.log.error(`[onReady] FEMS IP address is empty - please check configuration of ${this.namespace}`);
				return;
			}

			if (!this.config.ipAddress.match("^[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}")) {
				this.log.error(`[onReady] IP address has wrong format - please check configuration of ${this.namespace}`);
				return;
			}

			if (this.config.refreshIntervall < 5 || this.config.refreshIntervall > 3600) {
				this.log.error(`[onReady] Refresh interval only allows a range from 5s to 3600s - please check configuration of ${this.namespace}`);
				return;
			}

			// http://x:user@<ipAddress>/rest/channel/
			this.log.debug("[onReady] Adapter successful started.");
			this.apiClient = axios.create({
				baseURL: `http://x:owner@${this.config.ipAddress}/rest/channel/`,
				timeout: 5000,
				responseType: "json",
				responseEncoding: "utf8"
			});
			this.log.debug("[onReady] axios instance successful created.");

			await this.loadData();
		}
		catch (err) {
			this.log.error(`[onReady] Error during startup with message: ${err.message}`);
		}
	}

	async loadData() {
		try {
			this.log.debug("[loadData] Load data from FEMS.");
			if (!this.apiClient) {
				this.log.error("[loadData] Apiclient not instanced.");
				return;
			}

			/** @type {{ data: any[] }} */
			let response = { data: [] };
			if (!this.config.useCustomEndpoints) {
				const apiResponse = await this.apiClient.get(".*/.*");
				if (apiResponse.status === 200) {
					response.data.push(...apiResponse.data);
				}
			} else {
				const endpoints = this.config.endpoints;
				const endpointResponses = await Promise.all(endpoints.map(endpoint => {
					const getEndpoint = `${endpoint.componentId}/${endpoint.channelId}`;
					this.log.silly(`[loadData] Endpoint:  ${getEndpoint}`);
					return this.apiClient ? this.apiClient.get(getEndpoint) : Promise.reject(new Error("[loadData] API client is not defined"));
				}));



				endpointResponses.forEach(endpointResponse => {
					this.log.silly(`[loadData] response ${endpointResponse.status}: ${JSON.stringify(endpointResponse.data)}`);
					if (endpointResponse.status === 200) {
						// Ensure endpointResponse is always an array
						if (!Array.isArray(endpointResponse.data)) {
							endpointResponse.data = [endpointResponse.data];
						}
						response.data.push(...endpointResponse.data);
					}
				});
			}
			this.log.silly(`[loadData] combined response: ${JSON.stringify(response.data)}`);

			if (response.data.length > 0) {
				await this.createUpdateState(response.data);
				await this.calculateAutarchy();
				await this.calculateSelfConsumption();
			}
			this.log.debug("[loadData] REST request done and states updated.");
		}
		catch (err) {
			this.log.error(`[loadData] Error during loading data: ${err.message}`);
		}
		finally {
			// Restart request load Data!
			this.timer = this.setTimeout(async () => {
				this.log.debug("[loadData] Start next request.");
				this.timer = null;
				await this.loadData();
			}, this.config.refreshIntervall * 1000);
		}
	}

	/**
	 * Updates state.
	 * @param {object} data AXIOS Response Object Data
	 */
	async createUpdateState(data) {
		try {
			for (const item of data) {
				const [channel, state] = item.address.split("/");
				if (!channel || !state) continue;

				const channelName = this.name2id(channel);
				const stateName = this.name2id(state);
				const id = `${channel}.${state}`;

				const type = this.typeTranslation(item.type);

				if (type === "boolean") {
					item.value = !!item.value;
				}

				await this.createFolderObject(channelName);
				await this.createStateObject(id, item, stateName);

				this.log.debug(`[createUpdateState] StateId ${id} setState.`);
				await this.setState(id, { val: item.value, ack: true });
			}
		} catch (err) {
			this.log.error("[createUpdateState] Exception. " + err.message);
		}
	}

	/**
	 * @param {string} channelName
	 */
	async createFolderObject(channelName) {
		if (!createdChannel.includes(channelName)) {
			this.log.debug(`[createFolderObject] Channel ${channelName} not exists. Extend Object.`);
			await this.extendObject(channelName, {
				_id: channelName,
				type: "channel",
				common: {
					name: channelName
				},
				native: {}
			});
			createdChannel.push(channelName);
		}
	}

	/**
	 * @param {string} id
	 * @param {{ address: string; text: any; accessMode: string; type: any; unit: any; }} item
	 * @param {any} stateName
	 */
	async createStateObject(id, item, stateName) {
		if (!createdState.includes(id)) {
			this.log.debug(`[createStateObject] StateId ${id} not exists. Extend state.`);
			const existingState = States.find(f => f.address === item.address);
			await this.extendObject(id, {
				common: {
					name: stateName,
					desc: item.text,
					role: existingState?.role ?? "state",
					write: false,
					read: item.accessMode === "RO" || item.accessMode === "RW",
					type: this.typeTranslation(item.type),
					unit: item.unit
				},
				type: "state",
				native: {}
			});
			createdState.push(id);
		}
	}

	name2id(pName) {
		return (pName || '').replace(this.FORBIDDEN_CHARS, '_');
	}

	typeTranslation(inType) {
		const types = {
			INTEGER: "number",
			LONG: "number",
			DOUBLE: "number",
			FLOAT: "number",
			BOOLEAN: "boolean",
			STRING: "string"
		};
		return types[inType];
	}
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			if (this.timer) {
				this.clearTimeout(this.timer);
				this.timer = null;
			}
			callback();
		} catch (e) {
			callback();
		}
	}

	async calculateAutarchy() {
		const gridActivePowerId = "_sum.GridActivePower";
		const consumptionActivePowerId = "_sum.ConsumptionActivePower";

		if (!createdState.includes(gridActivePowerId) || !createdState.includes(consumptionActivePowerId)) {
			return;
		}

		const [gridActivePowerState, consumptionActivePowerState] = await Promise.all([
			this.getStateAsync(gridActivePowerId),
			this.getStateAsync(consumptionActivePowerId)
		]);

		const gridActivePower = gridActivePowerState?.val;
		const consumptionActivePower = consumptionActivePowerState?.val;
		let autarchy = 0;
		if (gridActivePower != null && consumptionActivePower != null && Number.isInteger(gridActivePower) && Number.isInteger(consumptionActivePower)) {
			if (+consumptionActivePower <= 0)
				autarchy = 100;
			else
				autarchy = Math.round(Math.max(0, Math.min(100, (1 - +gridActivePower / +consumptionActivePower) * 100)));

		}
		await this.createFolderObject("_sum");
		await this.createStateObject(
			"_sum.Autarchy",
			{
				address: "_sum/Autarchy",
				text: "Autarchy",
				accessMode: "RO",
				type: "INTEGER",
				unit: "%"
			},
			"Autarchy");
		await this.setState("_sum.Autarchy", { val: autarchy, ack: true });
	}

	async calculateSelfConsumption() {
		const gridActivePowerId = "_sum.GridActivePower";
		const productionActivePowerId = "_sum.ProductionActivePower";

		if (!createdState.includes(gridActivePowerId) || !createdState.includes(productionActivePowerId)) {
			return;
		}

		const [gridActivePowerState, productionActivePowerState] = await Promise.all([
			this.getStateAsync(gridActivePowerId),
			this.getStateAsync(productionActivePowerId)
		]);

		let sellToGrid = gridActivePowerState?.val;
		const productionActivePower = productionActivePowerState?.val;

		let selfConsumption = 0;

		if (sellToGrid != null && productionActivePower != null && Number.isInteger(sellToGrid) && Number.isInteger(productionActivePower)) {
			if (+sellToGrid <= 0)
				sellToGrid = +sellToGrid * -1
			if (+productionActivePower > 0) {
				selfConsumption = (1 - (+sellToGrid / +productionActivePower)) * 100;
				selfConsumption = Math.max(0, Math.min(100, Math.floor(selfConsumption)));
				// // At least 0 %
				// selfConsumption = Math.max(selfConsumption, 0);

				// // At most 100 %
				// selfConsumption = Math.min(selfConsumption, 100);
				// selfConsumption = Math.floor(selfConsumption);
			}
		}
		await this.createFolderObject("_sum");
		await this.createStateObject(
			"_sum.SelfConsumption",
			{
				address: "_sum/SelfConsumption",
				text: "SelfConsumption",
				accessMode: "RO",
				type: "INTEGER",
				unit: "%"
			},
			"SelfConsumption");
		await this.setState("_sum.SelfConsumption", { val: selfConsumption, ack: true });
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Fenecon(options);
} else {
	// otherwise start the instance directly
	new Fenecon();
}
