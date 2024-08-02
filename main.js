"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const axios = require("axios");

let isInit;

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
				this.log.error(`FEMS IP address is empty - please check configuration of ${this.namespace}`);
				return;
			}

			if (!this.config.ipAddress.match("^[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}")) {
				this.log.error(`IP address has wrong format - please check configuration of ${this.namespace}`);
				return;
			}

			if (this.config.refreshIntervall < 5 || this.config.refreshIntervall > 3600) {
				this.log.error(`Refresh interval only allows a range from 5s to 3600s - please check configuration of ${this.namespace}`);
				return;
			}

			isInit = true;

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
			this.log.error(`Error during startup with message: ${err.message}`);
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
				await this.calculateAutarchy();
				await this.calculateSelfConsumption();
			}
			isInit = false;
			this.log.debug("REST request done and states updated.");
		}
		catch (err) {
			this.log.error(`Error during loading data: ${err.message}`);
		}
		finally {
			// Restart request load Data!
			this.timer = this.setTimeout(async () => {
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
			for (const item of data) {
				const address = item.address.split("/");
				const id = address.join(".");
				const allowedId = this.name2id(id);

				if (address.length != 2)
					continue;

				if (this.typeTranslation(item.type) == "boolean")
					item.value = !!item.value;

				if (isInit == true) {
					this.log.debug("[updateState] Initialization " + JSON.stringify(item));
					await this.createUpdateState(item);
				} else {
					this.log.debug("[updateState] setState " + JSON.stringify(item));
					await this.setState(allowedId, { val: item.value, ack: true });
				}
			}
		} catch (err) {
			this.log.error("[updateState] Exception. " + err.message);
		}
	}

	/**
	 * @param {any} item
	 */
	async createUpdateState(item) {
		const address = item.address.split("/");
		const channelName = this.name2id(address[0]);
		const stateName = this.name2id(address[1]);
		const id = address.join(".");
		const allowedId = this.name2id(id);

		this.log.debug(`[createUpdateState] Channel ${channelName} not exists. Extend Object.`);
		await this.extendObject(channelName,
			{
				_id: channelName,
				type: "channel",
				common: {
					name: channelName
				},
				native: {}
			});

		this.log.debug(`[createUpdateState] StateId ${allowedId} not exists. Extend state.`);
		await this.extendObject(allowedId,
			{
				common: {
					name: stateName,
					desc: item.text,
					role: "state",
					// write: item.accessMode == "WO" || item.accessMode == "RW",
					write: false,
					read: item.accessMode == "RO" || item.accessMode == "RW",
					type: this.typeTranslation(item.type),
					unit: item.unit
				},
				type: "state",
				native: {}
			});
		this.log.debug(`[createUpdateState] StateId ${allowedId} setState.`);
		await this.setState(allowedId, { val: item.value, ack: true });
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
		const autarchyId = "_sum.Autarchy";
		const gridAcivePower = (await this.getStateAsync("_sum.GridActivePower"))?.val;
		const consumptionActivePower = (await this.getStateAsync("_sum.ConsumptionActivePower"))?.val;
		let autarchy = 0;
		if (gridAcivePower != null && consumptionActivePower != null && Number.isInteger(gridAcivePower) && Number.isInteger(consumptionActivePower)) {
			if (+consumptionActivePower <= 0)
				autarchy = 100;
			else
				autarchy = Math.round(Math.max(0, Math.min(100, (1 - +gridAcivePower / +consumptionActivePower) * 100)));

		}
		if (isInit == true)
			await this.createUpdateState({ address: "_sum/Autarchy", type: "INTEGER", accessMode: "RO", text: "Autarchy", unit: "%", value: autarchy });
		else
			await this.setState(autarchyId, { val: autarchy, ack: true });
	}

	async calculateSelfConsumption() {
		const selfConsumptionyId = "_sum.SelfConsumption";
		let sellToGrid = (await this.getStateAsync("_sum.GridActivePower"))?.val;
		const productionActivePower = (await this.getStateAsync("_sum.ProductionActivePower"))?.val;

		let selfConsumption = 0;

		if (sellToGrid != null && productionActivePower != null && Number.isInteger(sellToGrid) && Number.isInteger(productionActivePower)) {
			if (+sellToGrid <= 0)
				sellToGrid = +sellToGrid * -1
			if (+productionActivePower > 0) {
				selfConsumption = (1 - (+sellToGrid / +productionActivePower)) * 100;
				// At least 0 %
				selfConsumption = Math.max(selfConsumption, 0);

				// At most 100 %
				selfConsumption = Math.min(selfConsumption, 100);
				selfConsumption = Math.floor(selfConsumption);
			}
		}
		if (isInit == true)
			await this.createUpdateState({ address: "_sum/SelfConsumption", type: "INTEGER", accessMode: "RO", text: "SelfConsumption", unit: "%", value: selfConsumption });
		else
			await this.setState(selfConsumptionyId, { val: selfConsumption, ack: true });
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
