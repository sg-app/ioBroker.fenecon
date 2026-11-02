/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import { isIPv4 } from 'node:net';
import { calculateAutarchy, calculateSelfConsumption } from './calculations';
import { FemsClient, type Logger } from './fems-client';
import { buildChannelObject, buildStateObject, name2id, toBooleanValue, typeTranslation } from './state-factory';
import type { FemsChannel } from './types';

class Fenecon extends utils.Adapter {
    /** Channels which were already created in the object tree. */
    private readonly createdChannels: Set<string> = new Set<string>();
    /** States which were already created in the object tree. */
    private readonly createdStates: Set<string> = new Set<string>();
    /** REST client for the FEMS box. */
    private client: FemsClient | null = null;
    /** Timer of the next scheduled update. */
    private timer: ioBroker.Timeout | null | undefined = null;
    /** Whether the adapter is shutting down. */
    private unloaded = false;

    /**
     * @param options - Adapter options provided by ioBroker
     */
    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'fenecon',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        try {
            if (!this.config.ipAddress) {
                this.log.error(`[onReady] FEMS IP address is empty - please check configuration of ${this.namespace}`);
                return;
            }

            if (!isIPv4(this.config.ipAddress)) {
                this.log.error(
                    `[onReady] IP address has wrong format - please check configuration of ${this.namespace}`,
                );
                return;
            }

            if (this.config.refreshIntervall < 5 || this.config.refreshIntervall > 3600) {
                this.log.error(
                    `[onReady] Refresh interval only allows a range from 5s to 3600s - please check configuration of ${this.namespace}`,
                );
                return;
            }

            this.log.debug('[onReady] Adapter successful started.');
            this.client = new FemsClient({
                ipAddress: this.config.ipAddress,
                endpoints: this.config.useCustomEndpoints ? this.config.endpoints : [],
                logger: this.createLogger(),
            });

            await this.loadData();
        } catch (error) {
            this.log.error(`[onReady] Error during startup with message: ${this.getErrorMessage(error)}`);
        }
    }

    /**
     * Creates the logger the REST client writes to.
     *
     * @returns Logger bound to this adapter instance
     */
    private createLogger(): Logger {
        return {
            debug: (message: string): void => this.log.debug(message),
            silly: (message: string): void => this.log.silly(message),
            error: (message: string): void => this.log.error(message),
        };
    }

    /**
     * Reads a state value and coerces it to a number.
     *
     * @param id - Id of the state
     * @returns The numeric value or `null` if the state is missing or not numeric
     */
    private async getNumericStateValue(id: string): Promise<number | null> {
        const state = await this.getStateAsync(id);
        const value = state?.val;
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }
        return null;
    }

    /**
     * Extracts the message of an unknown error value.
     *
     * @param error - Value thrown by a catch block
     * @returns The error message
     */
    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    /**
     * Loads the channel values from FEMS and schedules the next run.
     */
    private async loadData(): Promise<void> {
        try {
            if (!this.client) {
                this.log.error('[loadData] Apiclient not instanced.');
                return;
            }

            const channels = await this.client.loadChannels();
            if (channels.length > 0) {
                await this.createUpdateState(channels);
                await this.calculateAutarchy();
                await this.calculateSelfConsumption();
            }
            this.log.debug('[loadData] REST request done and states updated.');
        } catch (error) {
            this.log.error(`[loadData] Error during loading data: ${this.getErrorMessage(error)}`);
        } finally {
            this.scheduleNextRun();
        }
    }

    /**
     * Schedules the next update, unless the adapter is shutting down.
     */
    private scheduleNextRun(): void {
        if (this.unloaded) {
            return;
        }

        this.timer = this.setTimeout(async (): Promise<void> => {
            this.log.debug('[loadData] Start next request.');
            this.timer = null;
            await this.loadData();
        }, this.config.refreshIntervall * 1000);
    }

    /**
     * Updates the states for all channels delivered by FEMS.
     *
     * @param channels - Channels delivered by the FEMS REST API
     */
    private async createUpdateState(channels: FemsChannel[]): Promise<void> {
        try {
            for (const channel of channels) {
                const [rawChannelName, rawStateName] = channel.address.split('/');
                if (!rawChannelName || !rawStateName) {
                    continue;
                }

                const channelName = name2id(rawChannelName, this.FORBIDDEN_CHARS);
                const stateName = name2id(rawStateName, this.FORBIDDEN_CHARS);
                const type = typeTranslation(channel.type);
                const value = type === 'boolean' ? toBooleanValue(channel.value) : channel.value;
                const id = `${channelName}.${stateName}`;

                await this.createFolderObject(channelName);
                await this.createStateObject(id, channel, stateName);

                this.log.debug(`[createUpdateState] StateId ${id} setState.`);
                await this.setState(id, { val: value, ack: true });
            }
        } catch (error) {
            this.log.error(`[createUpdateState] Exception. ${this.getErrorMessage(error)}`);
        }
    }

    /**
     * Creates the channel object if it does not exist yet.
     *
     * @param channelName - Sanitized channel name
     */
    private async createFolderObject(channelName: string): Promise<void> {
        if (this.createdChannels.has(channelName)) {
            return;
        }

        this.log.debug(`[createFolderObject] Channel ${channelName} not exists. Extend Object.`);
        await this.extendObject(channelName, buildChannelObject(channelName));
        this.createdChannels.add(channelName);
    }

    /**
     * Creates the state object if it does not exist yet.
     *
     * @param id - Id of the state
     * @param channel - Channel delivered by the FEMS REST API
     * @param stateName - Sanitized state name
     */
    private async createStateObject(id: string, channel: FemsChannel, stateName: string): Promise<void> {
        if (this.createdStates.has(id)) {
            return;
        }

        this.log.debug(`[createStateObject] StateId ${id} not exists. Extend state.`);
        await this.extendObject(id, buildStateObject(stateName, channel));
        this.createdStates.add(id);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    private onUnload(callback: () => void): void {
        try {
            this.unloaded = true;
            if (this.timer) {
                this.clearTimeout(this.timer);
                this.timer = null;
            }
            callback();
        } catch {
            callback();
        }
    }

    /**
     * Calculates the autarchy rate from the grid and consumption power.
     */
    private async calculateAutarchy(): Promise<void> {
        const id = '_sum.Autarchy';
        if (!this.createdStates.has('_sum.GridActivePower') || !this.createdStates.has('_sum.ConsumptionActivePower')) {
            return;
        }

        const [gridActivePower, consumptionActivePower] = await Promise.all([
            this.getNumericStateValue('_sum.GridActivePower'),
            this.getNumericStateValue('_sum.ConsumptionActivePower'),
        ]);

        const autarchy = calculateAutarchy(gridActivePower, consumptionActivePower);
        if (autarchy === null) {
            return;
        }

        await this.createStateObject(id, this.toSummaryChannel('_sum/Autarchy', 'Autarchy'), 'Autarchy');
        await this.setState(id, { val: autarchy, ack: true });
    }

    /**
     * Calculates the self consumption rate from the grid and production power.
     */
    private async calculateSelfConsumption(): Promise<void> {
        const id = '_sum.SelfConsumption';
        if (!this.createdStates.has('_sum.GridActivePower') || !this.createdStates.has('_sum.ProductionActivePower')) {
            return;
        }

        const [gridActivePower, productionActivePower] = await Promise.all([
            this.getNumericStateValue('_sum.GridActivePower'),
            this.getNumericStateValue('_sum.ProductionActivePower'),
        ]);

        const selfConsumption = calculateSelfConsumption(gridActivePower, productionActivePower);
        if (selfConsumption === null) {
            return;
        }

        await this.createStateObject(
            id,
            this.toSummaryChannel('_sum/SelfConsumption', 'SelfConsumption'),
            'SelfConsumption',
        );
        await this.setState(id, { val: selfConsumption, ack: true });
    }

    /**
     * Builds a channel description for the calculated summary states.
     *
     * @param address - FEMS address of the calculated value
     * @param text - Description of the calculated value
     * @returns A FEMS channel
     */
    private toSummaryChannel(address: string, text: string): FemsChannel {
        return { address, type: 'INTEGER', text, accessMode: 'RO', unit: '%', value: 0 };
    }
}

export { Fenecon };

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined): Fenecon => new Fenecon(options);
} else {
    // otherwise start the instance directly
    (() => new Fenecon())();
}
