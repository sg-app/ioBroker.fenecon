import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { isFemsAccessMode, isFemsValueType, type FemsChannel } from './types';

/**
 * A message that is either a ready string or a lazy factory.
 *
 * The factory is only called when the message is actually logged. This keeps
 * expensive string building (for example `JSON.stringify`) out of the hot path.
 */
export type LogMessage = string | (() => string);

/**
 * Minimal logging interface used by the client.
 */
export interface Logger {
    /** Logs a debug message. */
    debug: (message: LogMessage) => void;
    /** Logs a very verbose message. */
    silly: (message: LogMessage) => void;
    /** Logs an error message. */
    error: (message: LogMessage) => void;
}

/**
 * Matches a FEMS address with exactly two segments, e.g. `_sum/GridActivePower`.
 */
const ADDRESS_PATTERN = /^[^/]+\/[^/]+$/;

/**
 * Result of a channel validation run.
 */
export interface ChannelValidationResult {
    /** Channels that passed the validation. */
    valid: FemsChannel[];
    /** Human readable description of every dropped entry. */
    rejected: string[];
}

/**
 * Checks whether an arbitrary value looks like a FEMS channel.
 *
 * The FEMS box normally returns structured JSON. If it fails it may answer with
 * an HTML error page instead, so the response must never be trusted blindly.
 *
 * @param value - Value to check
 * @returns `true` if the value is a valid FEMS channel
 */
export function isValidChannel(value: unknown): value is FemsChannel {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const channel = value as Partial<FemsChannel>;
    return (
        typeof channel.address === 'string' &&
        ADDRESS_PATTERN.test(channel.address) &&
        isFemsValueType(channel.type) &&
        isFemsAccessMode(channel.accessMode) &&
        typeof channel.text === 'string' &&
        typeof channel.unit === 'string'
    );
}

/**
 * Splits a FEMS response into valid channels and a list of rejected entries.
 *
 * @param data - Raw payload of a FEMS response
 * @returns The valid channels and the description of every dropped entry
 */
export function validateChannels(data: unknown): ChannelValidationResult {
    const entries: unknown[] = Array.isArray(data) ? data : [data];
    const valid: FemsChannel[] = [];
    const rejected: string[] = [];

    for (const entry of entries) {
        if (isValidChannel(entry)) {
            valid.push(entry);
        } else {
            const address =
                typeof entry === 'object' && entry !== null && 'address' in entry
                    ? String(entry.address)
                    : JSON.stringify(entry);
            rejected.push(`invalid channel: ${address}`);
        }
    }

    return { valid, rejected };
}

/**
 * A single FEMS endpoint as configured in the adapter configuration.
 */
export interface FemsEndpoint {
    /** Component id, e.g. `_sum`. */
    componentId: string;
    /** Semicolon separated list of channel ids, e.g. `SoC;State`. */
    channelId?: string;
}

/**
 * Options for the {@link FemsClient}.
 */
export interface FemsClientOptions {
    /** IP address of the FEMS box. */
    ipAddress: string;
    /** Optional custom endpoints, used instead of the catch all request. */
    endpoints?: FemsEndpoint[];
    /** Request timeout in milliseconds. */
    timeout?: number;
    /** Logger used for diagnostic output. */
    logger: Logger;
}

/**
 * REST client for the OpenEMS (FEMS) channel API.
 */
export class FemsClient {
    private readonly logger: Logger;
    private readonly endpoints: FemsEndpoint[];
    private readonly apiClient: AxiosInstance;

    /**
     * Creates a new client.
     *
     * @param options - Client options
     * @param apiClient - Optional axios instance, mainly used for testing
     */
    public constructor(options: FemsClientOptions, apiClient?: AxiosInstance) {
        this.logger = options.logger;
        this.endpoints = options.endpoints ?? [];
        this.apiClient =
            apiClient ??
            axios.create({
                baseURL: `http://x:owner@${options.ipAddress}/rest/channel/`,
                timeout: options.timeout ?? 5000,
                responseType: 'json',
                responseEncoding: 'utf8',
            });
        this.logger.debug('[FemsClient] axios instance successful created.');
    }

    /**
     * Loads all configured channels from the FEMS box.
     *
     * Invalid entries are dropped and logged once, so that a broken response
     * (for example an HTML error page) never creates nonsense states.
     *
     * @returns All valid channel values of the requested endpoints, or an empty array in case of errors
     */
    public async loadChannels(): Promise<FemsChannel[]> {
        this.logger.debug('[loadChannels] Load data from FEMS.');
        const channels: FemsChannel[] = [];

        if (this.endpoints.length === 0) {
            const response = await this.requestChannel('.*/.*');
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
    private buildEndpointRequests(): Promise<FemsChannel[] | null>[] {
        const requests: Promise<FemsChannel[] | null>[] = [];

        for (const endpoint of this.endpoints) {
            const channelIds = (endpoint.channelId || '')
                .split(';')
                .map((channelId: string): string => channelId.trim())
                .filter((channelId: string): boolean => !!channelId);

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
    private async requestChannel(path: string): Promise<FemsChannel[] | null> {
        try {
            const response: AxiosResponse<unknown> = await this.apiClient.get(path);
            if (response.status !== 200) {
                return null;
            }

            const { valid, rejected } = validateChannels(response.data);
            if (rejected.length > 0) {
                this.logger.error(
                    `[requestChannel] Dropped ${rejected.length} invalid entries of ${path}: ${rejected
                        .slice(0, 5)
                        .join(', ')}${rejected.length > 5 ? ', …' : ''}`,
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
    public async writeChannel(address: string, value: ioBroker.StateValue): Promise<boolean> {
        if (!ADDRESS_PATTERN.test(address)) {
            this.logger.error(`[writeChannel] Invalid channel address: ${address}`);
            return false;
        }

        try {
            const response: AxiosResponse<unknown> = await this.apiClient.post(address, { value });
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
