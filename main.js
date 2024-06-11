"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const axios = require("axios");

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
		this.on("stateChange", this.onStateChange.bind(this));
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
				this.log.error(`FEMS IP address is empty - please check configuration of ${this.namespace}`);
				return;
			}

			if (!this.config.ipAddress.match("^[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}")) {
				this.log.error(`IP address has wrong format - please check configuration of ${this.namespace}`);
				return;
			}
			// http://x:user@<ipAddress>/rest/channel/
			this.log.debug("Adapter successful started.");
			this.apiClient = axios.create({
				baseURL: `http://x:owner@${this.config.ipAddress}/rest/channel/`,
				timeout: 5000,
				responseType: "json",
				responseEncoding: "utf8"
			});
			this.log.debug("axios instance successful created.");

			// this.subscribeStates("*");

			await this.loadData();
		}
		catch (err) {
			this.log.error(`Error during startup wiht message: ${err.message}`);
		}
	}

	async loadData() {
		try {
			this.log.debug("Load data from FEMS.");
			if (!this.apiClient) {
				this.log.error("Apiclient not instanced.");
				return;
			}

			const response = await this.apiClient.get(".*/.*");
			this.log.silly(`[loadData] response ${response.status}: ${JSON.stringify(response.data)}`);

			if (response.status === 200) {
				await this.updateState(response.data);
			}

			await this.calculateAutarchy();

			this.log.debug("REST request done and states updated.");
		}
		catch (err) {
			this.log.error(`Error during loading data: ${err.message}`);
		}
		finally {
			// Restart request load Data!
			this.timer = setTimeout(async () => {
				this.log.debug("Start next request.");
				this.timer = null;
				await this.loadData();
			}, this.config.refreshIntervall * 1000);
		}
	}
	/**
	 * Updates state.
	 * @param {object} data AXIOS Response Object Data
	 */
	async updateState(data) {
		try {

			const typeTranslation = {
				INTEGER: "number",
				LONG: "number",
				DOUBLE: "number",
				FLOAT: "number",
				BOOLEAN: "boolean",
				STRING: "string"
			};

			for (const item of data) {
				const address = item.address.split("/");
				const type = typeTranslation[item.type];
				const id = address.join(".");

				if (address.length != 2)
					continue;

				if (type == "boolean") {
					item.value = !!item.value;
				}

				const stateObj = {
					common: {
						name: address[1],
						desc: item.text,
						role: "value",
						write: item.accessMode == "WO" || item.accessMode == "RW",
						read: item.accessMode == "RO" || item.accessMode == "RW",
						type: type,
						unit: item.unit
					},
					type: "state",
					native: {}
				};
				await this.createUpdateState(id, item.value, stateObj);
			}

		} catch (err) {
			this.log.error("Can't update states. " + err.message);
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			if (this.timer) {
				clearTimeout(this.timer);
				this.timer = null;
			}
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		const stateId = id.replace(`${this.namespace}.`, "");

		if (state && !state.ack) {
			this.log.debug(`[onStateChange] "${stateId}" state changed: ${JSON.stringify(state)}`);
		}
	}

	async calculateAutarchy() {
		const autarchyId = "_sum.Autarchy";
		const gridAcivePower = (await this.getStateAsync(`${this.namespace}._sum.GridActivePower`))?.val;
		const consumptionActivePower = (await this.getStateAsync(`${this.namespace}._sum.ConsumptionActivePower`))?.val;
		let autarchy = 0;
		if (gridAcivePower != null && consumptionActivePower != null && Number.isInteger(gridAcivePower) && Number.isInteger(consumptionActivePower)) {
			if (+consumptionActivePower <= 0) {
				autarchy = 100;
			} else {
				autarchy = Math.round(Math.max(0, Math.min(100, (1 - +gridAcivePower / +consumptionActivePower) * 100)));
			}
		}
		const stateObj =
		{
			common: {
				name: "Autarchy",
				role: "value",
				write: false,
				read: true,
				type: "number",
				unit: "%"
			},
			type: "state",
			native: {}
		};
		await this.createUpdateState(autarchyId, autarchy, stateObj);
	}

	/**
	 * @param {string} id
	 * @param {number | boolean | string} value
	 * @param {any} stateObject
	 */
	async createUpdateState(id, value, stateObject) {
		const state = await this.getStateAsync(id);
		if (state == null) {
			this.log.silly(`[createUpdateState] ExtendObject ${id} StateObject: ${JSON.stringify(stateObject)}`);
			await this.extendObjectAsync(id, stateObject);
		}
		this.log.silly(`[createUpdateState] SetState ${id} Value: ${value}`);
		await this.setStateAsync(id, { val: value, ack: true });
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
