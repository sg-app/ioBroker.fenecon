// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import { isIPv4 } from 'node:net';
import { calculateAutarchy, calculateSelfConsumption } from './calculations';
import { FemsClient, type LogMessage, type Logger } from './fems-client';
import {
    buildChannelObject,
    buildStateObject,
    convertToFemsValue,
    convertValue,
    isWritable,
    name2id,
    resolveRoleWithSource,
    toBooleanValue,
    typeTranslation,
} from './state-factory';
import type { FemsChannel } from './types';

/** States which did not change are rewritten at least once within this interval. */
const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;
/** Number of state writes which are dispatched in parallel. */
const WRITE_BATCH_SIZE = 50;

class Fenecon extends utils.Adapter {
    /** Channels which were already created in the object tree. */
    private readonly createdChannels: Set<string> = new Set<string>();
    /** Signature of the state object which is currently stored for a state id. */
    private readonly stateSignatures: Map<string, string> = new Map<string, string>();
    /** Last written value per state id, used to skip unchanged values. */
    private readonly valueCache: Map<string, ioBroker.StateValue> = new Map<string, ioBroker.StateValue>();
    /** Unknown FEMS addresses which were already reported in the log. */
    private readonly reportedUnknown: Set<string> = new Set<string>();
    /** Last known FEMS channel per state id, used to write values back. */
    private readonly stateChannels: Map<string, FemsChannel> = new Map<string, FemsChannel>();
    /** Writable states which are already subscribed. */
    private readonly subscribedStates: Set<string> = new Set<string>();
    /** Timestamp of the last full write cycle. */
    private lastFullWrite = 0;
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
        this.on('stateChange', this.onStateChange.bind(this));
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
            await this.loadExistingObjects();

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
     * Loads all existing objects of this adapter once at startup.
     *
     * This avoids per state `getObject` calls and allows the adapter to detect
     * which objects are already present and which definition changed.
     */
    private async loadExistingObjects(): Promise<void> {
        const objects = await this.getAdapterObjectsAsync();
        const prefix = `${this.namespace}.`;

        for (const [id, object] of Object.entries(objects)) {
            const localId = id.startsWith(prefix) ? id.slice(prefix.length) : id;

            if (object.type === 'channel') {
                this.createdChannels.add(localId);
            } else if (object.type === 'state') {
                this.stateSignatures.set(localId, this.stateSignature(object));
            }
        }

        this.log.debug(
            `[loadExistingObjects] Found ${this.createdChannels.size} channels and ${this.stateSignatures.size} states.`,
        );
    }

    /**
     * Builds a comparable signature of the state properties the adapter manages.
     *
     * @param object - State object, either from the object tree or newly built
     * @returns A string which changes whenever a managed property changes
     */
    private stateSignature(object: Pick<ioBroker.StateObject, 'common'>): string {
        const common = object.common;
        return JSON.stringify([
            common.name,
            common.desc,
            common.role,
            common.type,
            common.unit,
            common.read,
            common.write,
        ]);
    }

    /**
     * Creates the logger the REST client writes to.
     *
     * @returns Logger bound to this adapter instance
     */
    private createLogger(): Logger {
        return {
            debug: (message: LogMessage): void => this.log.debug(this.resolveMessage(message)),
            silly: (message: LogMessage): void => {
                if (this.log.level === 'silly') {
                    this.log.silly(this.resolveMessage(message));
                }
            },
            error: (message: LogMessage): void => this.log.error(this.resolveMessage(message)),
        };
    }

    /**
     * Resolves a possibly lazy log message.
     *
     * @param message - Message or factory
     * @returns The resolved message string
     */
    private resolveMessage(message: LogMessage): string {
        return typeof message === 'function' ? message() : message;
    }

    /**
     * Reads a cached state value and coerces it to a number.
     *
     * @param id - Id of the state
     * @returns The numeric value or `null` if the state is missing or not numeric
     */
    private getCachedNumber(id: string): number | null {
        const value = this.valueCache.get(id);
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
     * Only changed values are written. Unchanged values are refreshed once per
     * heartbeat, so that the timestamps do not become stale.
     *
     * @param channels - Channels delivered by the FEMS REST API
     */
    private async createUpdateState(channels: FemsChannel[]): Promise<void> {
        if (Date.now() - this.lastFullWrite >= HEARTBEAT_INTERVAL_MS) {
            this.valueCache.clear();
            this.lastFullWrite = Date.now();
        }

        const pending: { id: string; val: ioBroker.StateValue }[] = [];
        let skipped = 0;

        for (const channel of channels) {
            try {
                const parts = channel.address.split('/');
                if (parts.length !== 2 || !parts[0] || !parts[1]) {
                    continue;
                }

                const channelName = name2id(parts[0], this.FORBIDDEN_CHARS);
                const stateName = name2id(parts[1], this.FORBIDDEN_CHARS);
                const type = typeTranslation(channel.type);
                const value =
                    type === 'boolean' ? toBooleanValue(channel.value) : convertValue(channel.value, channel.unit);
                const id = `${channelName}.${stateName}`;

                await this.createChannelObject(channelName);
                await this.createStateObject(id, channel, stateName);

                if (this.shouldWrite(id, value)) {
                    pending.push({ id, val: value });
                } else {
                    skipped += 1;
                }
            } catch (error) {
                this.log.error(`[createUpdateState] Skipping ${channel.address}: ${this.getErrorMessage(error)}`);
            }
        }

        await this.writeStates(pending);
        this.log.debug(
            `[createUpdateState] ${channels.length} channels, ${pending.length} written, ${skipped} unchanged.`,
        );
    }

    /**
     * Checks whether a value must be written to the state.
     *
     * @param id - Id of the state
     * @param value - New value
     * @returns `true` if the value differs from the last written one
     */
    private shouldWrite(id: string, value: ioBroker.StateValue): boolean {
        if (this.valueCache.get(id) === value) {
            return false;
        }

        this.valueCache.set(id, value);
        return true;
    }

    /**
     * Writes all pending state values in parallel batches.
     *
     * @param pending - States which must be written
     */
    private async writeStates(pending: { id: string; val: ioBroker.StateValue }[]): Promise<void> {
        for (let index = 0; index < pending.length; index += WRITE_BATCH_SIZE) {
            const batch = pending.slice(index, index + WRITE_BATCH_SIZE);
            await Promise.all(batch.map(({ id, val }) => this.setState(id, { val, ack: true })));
        }
    }

    /**
     * Creates the channel object if it does not exist yet.
     *
     * @param channelName - Sanitized channel name
     */
    private async createChannelObject(channelName: string): Promise<void> {
        if (this.createdChannels.has(channelName)) {
            return;
        }

        await this.extendObject(channelName, buildChannelObject(channelName));
        this.createdChannels.add(channelName);
    }

    /**
     * Creates or updates the state object when its definition changed.
     *
     * @param id - Id of the state
     * @param channel - Channel delivered by the FEMS REST API
     * @param stateName - Sanitized state name
     */
    private async createStateObject(id: string, channel: FemsChannel, stateName: string): Promise<void> {
        // Remember the channel so that a value can be written back later.
        this.stateChannels.set(id, channel);
        if (isWritable(channel.accessMode)) {
            this.subscribeWritableState(id);
        }

        const stateObject = buildStateObject(stateName, channel);
        const signature = this.stateSignature(stateObject);
        if (this.stateSignatures.get(id) === signature) {
            return;
        }

        const { role, known } = resolveRoleWithSource(channel.address, channel.unit);
        if (!known) {
            this.reportUnknownAddress(channel, role);
        }

        await this.extendObject(id, stateObject);
        this.stateSignatures.set(id, signature);
    }

    /**
     * Subscribes a writable state so that user commands reach {@link onStateChange}.
     *
     * @param id - Id of the state
     */
    private subscribeWritableState(id: string): void {
        if (this.subscribedStates.has(id)) {
            return;
        }

        this.subscribeStates(id);
        this.subscribedStates.add(id);
    }

    /**
     * Is called when a state which the adapter subscribed to changed.
     *
     * Values written by the user (ack is not set) are forwarded to FEMS.
     *
     * @param id - Full id of the changed state
     * @param state - New state value
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state || state.ack) {
            return;
        }

        const prefix = `${this.namespace}.`;
        const localId = id.startsWith(prefix) ? id.slice(prefix.length) : id;
        const channel = this.stateChannels.get(localId);
        if (!channel) {
            this.log.warn(`[onStateChange] No channel information for ${id}.`);
            return;
        }

        if (!isWritable(channel.accessMode)) {
            this.log.warn(`[onStateChange] Channel ${channel.address} is not writable.`);
            return;
        }

        if (!this.client) {
            this.log.warn(`[onStateChange] No client available to write ${channel.address}.`);
            return;
        }

        const value = convertToFemsValue(state.val, channel.unit);
        const success = await this.client.writeChannel(channel.address, value);
        if (success) {
            await this.setState(localId, { val: state.val, ack: true });
        } else {
            this.log.error(`[onStateChange] Could not write ${channel.address} = ${JSON.stringify(state.val)}.`);
        }
    }

    /**
     * Reports an unknown FEMS address once, so it can be added to the mapping table.
     *
     * @param channel - Channel delivered by the FEMS REST API
     * @param role - Role which was derived as fallback
     */
    private reportUnknownAddress(channel: FemsChannel, role: string): void {
        if (this.reportedUnknown.has(channel.address)) {
            return;
        }

        this.reportedUnknown.add(channel.address);
        this.log.info(
            `[createStateObject] Unknown channel ${channel.address} (type ${channel.type}, accessMode ${channel.accessMode}, unit '${channel.unit}') - ` +
                `derived role '${role}'. Please report it so it can be added to the mapping table.`,
        );
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
        if (!this.valueCache.has('_sum.GridActivePower') || !this.valueCache.has('_sum.ConsumptionActivePower')) {
            return;
        }

        const autarchy = calculateAutarchy(
            this.getCachedNumber('_sum.GridActivePower'),
            this.getCachedNumber('_sum.ConsumptionActivePower'),
        );
        if (autarchy === null) {
            return;
        }

        await this.createChannelObject('_sum');
        await this.createStateObject(id, this.toSummaryChannel('_sum/Autarchy', 'Autarchy'), 'Autarchy');
        if (this.shouldWrite(id, autarchy)) {
            await this.setState(id, { val: autarchy, ack: true });
        }
    }

    /**
     * Calculates the self consumption rate from the grid and production power.
     */
    private async calculateSelfConsumption(): Promise<void> {
        const id = '_sum.SelfConsumption';
        if (!this.valueCache.has('_sum.GridActivePower') || !this.valueCache.has('_sum.ProductionActivePower')) {
            return;
        }

        const selfConsumption = calculateSelfConsumption(
            this.getCachedNumber('_sum.GridActivePower'),
            this.getCachedNumber('_sum.ProductionActivePower'),
        );
        if (selfConsumption === null) {
            return;
        }

        await this.createChannelObject('_sum');
        await this.createStateObject(
            id,
            this.toSummaryChannel('_sum/SelfConsumption', 'SelfConsumption'),
            'SelfConsumption',
        );
        if (this.shouldWrite(id, selfConsumption)) {
            await this.setState(id, { val: selfConsumption, ack: true });
        }
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

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined): Fenecon => new Fenecon(options);
} else {
    // otherwise start the instance directly
    (() => new Fenecon())();
}
