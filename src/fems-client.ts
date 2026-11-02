import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import type { FemsChannel } from './types';

/**
 * Minimal logging interface used by the client.
 */
export interface Logger {
    /** Logs a debug message. */
    debug: (message: string) => void;
    /** Logs a very verbose message. */
    silly: (message: string) => void;
    /** Logs an error message. */
    error: (message: string) => void;
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
     * @returns All channel values of the requested endpoints, or an empty array in case of errors
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

        this.logger.silly(`[loadChannels] combined response: ${JSON.stringify(channels)}`);
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
            const response: AxiosResponse<FemsChannel | FemsChannel[]> = await this.apiClient.get(path);
            if (response.status !== 200) {
                return null;
            }
            return Array.isArray(response.data) ? response.data : [response.data];
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[requestChannel] Error for endpoint ${path}: ${message}`);
            return null;
        }
    }
}
