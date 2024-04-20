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
				baseURL: `http://x:user@${this.config.ipAddress}/rest/channel/`,
				timeout: 5000,
				responseType: "json",
				responseEncoding: "utf8"
			});
			this.log.debug("axios instance successful created.");

			await this.loadData();
		}
		catch (err) {
			this.log.error(`Error during startup wiht message: ${err.message}`);
		}
	}

	async loadData() {
		try {
			this.log.info("Load data from FEMS.");
			if (!this.apiClient) {
				this.log.error("Apiclient not instanced.");
				return;
			}

			const response = await this.apiClient.get(".*/.*");
			this.log.silly(`response ${response.status}: ${JSON.stringify(response.data)}`);

			if (response.status === 200) {
				await this.updateState(response.data);
			}

			this.log.info("REST request done and states updated.");
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

				this.log.silly(`ExtendObject ${id} with Data: ${item.value} and Type: ${type}`);
				await this.extendObjectAsync(id,
					{
						common: {
							name: address[1],
							desc: item.text,
							role: "value",
							write: false,
							read: true,
							type: type,
							unit: item.unit
						},
						type: "state",
						native: {}
					});
				await this.setStateAsync(id, { val: item.value, ack: true });
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
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
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
