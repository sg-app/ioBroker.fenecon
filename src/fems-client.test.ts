import { AxiosHeaders, type AxiosInstance, type AxiosResponse } from 'axios';
import { expect } from 'chai';
import { FemsClient, type FemsClientOptions, type FemsEndpoint, type Logger } from './fems-client';
import type { FemsChannel } from './types';

/**
 * Creates a logger stub that collects all messages.
 *
 * @returns The logger and the collected messages
 */
function makeLogger(): { logger: Logger; messages: string[] } {
    const messages: string[] = [];
    return {
        logger: {
            debug: (message: string): void => void messages.push(`debug:${message}`),
            silly: (message: string): void => void messages.push(`silly:${message}`),
            error: (message: string): void => void messages.push(`error:${message}`),
        },
        messages,
    };
}

/**
 * Creates a channel fixture.
 *
 * @param address - Address of the channel
 * @returns A FEMS channel
 */
function makeChannel(address: string): FemsChannel {
    return {
        address,
        type: 'INTEGER',
        text: address,
        accessMode: 'RO',
        unit: 'W',
        value: 1,
    };
}

/**
 * Creates an axios instance where a mocked `get` implementation is used.
 *
 * @param get - Implementation of the `get` method
 * @returns The axios instance
 */
function makeApiClient(get: (path: string) => Promise<AxiosResponse<FemsChannel | FemsChannel[]>>): AxiosInstance {
    return { get } as unknown as AxiosInstance;
}

/**
 * Creates a successful response for a single channel.
 *
 * @param data - The channel or channels to return
 * @returns The axios response
 */
function okResponse(data: FemsChannel | FemsChannel[]): AxiosResponse<FemsChannel | FemsChannel[]> {
    return {
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
        data,
    };
}

/**
 * Creates client options.
 *
 * @param logger - Logger instance to use
 * @param endpoints - Optional custom endpoints
 * @returns The client options
 */
function makeOptions(logger: Logger, endpoints?: FemsEndpoint[]): FemsClientOptions {
    return { ipAddress: '192.168.1.10', endpoints, logger };
}

describe('lib/fems-client', () => {
    it('requests all channels with the catch all path by default', async () => {
        const requestedPaths: string[] = [];
        const { logger } = makeLogger();
        const client = new FemsClient(
            makeOptions(logger),
            makeApiClient((path: string): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> => {
                requestedPaths.push(path);
                return Promise.resolve(okResponse([makeChannel('_sum/SoC'), makeChannel('_sum/State')]));
            }),
        );

        const channels = await client.loadChannels();
        expect(requestedPaths).to.deep.equal(['.*/.*']);
        expect(channels.map((channel: FemsChannel): string => channel.address)).to.deep.equal([
            '_sum/SoC',
            '_sum/State',
        ]);
    });

    it('splits semicolon separated channel ids and trims them', async () => {
        const requestedPaths: string[] = [];
        const { logger } = makeLogger();
        const client = new FemsClient(
            makeOptions(logger, [{ componentId: '_sum', channelId: ' SoC ; State ;' }]),
            makeApiClient((path: string): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> => {
                requestedPaths.push(path);
                return Promise.resolve(okResponse(makeChannel(path)));
            }),
        );

        const channels = await client.loadChannels();
        expect(requestedPaths).to.deep.equal(['_sum/SoC', '_sum/State']);
        expect(channels).to.have.length(2);
    });

    it('wraps a single channel object into an array', async () => {
        const { logger } = makeLogger();
        const client = new FemsClient(
            makeOptions(logger, [{ componentId: 'ess0', channelId: 'SoC' }]),
            makeApiClient((): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> =>
                Promise.resolve(okResponse(makeChannel('ess0/SoC'))),
            ),
        );

        const channels = await client.loadChannels();
        expect(channels.map((channel: FemsChannel): string => channel.address)).to.deep.equal(['ess0/SoC']);
    });

    it('skips endpoints without channel ids', async () => {
        const requestedPaths: string[] = [];
        const { logger } = makeLogger();
        const client = new FemsClient(
            makeOptions(logger, [{ componentId: '_sum' }]),
            makeApiClient((path: string): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> => {
                requestedPaths.push(path);
                return Promise.resolve(okResponse(makeChannel(path)));
            }),
        );

        const channels = await client.loadChannels();
        expect(requestedPaths).to.deep.equal([]);
        expect(channels).to.deep.equal([]);
    });

    it('does not fail if a single endpoint returns an error', async () => {
        const { logger, messages } = makeLogger();
        const client = new FemsClient(
            makeOptions(logger, [
                { componentId: '_sum', channelId: 'SoC;State' },
                { componentId: 'ess0', channelId: 'SoC' },
            ]),
            makeApiClient((path: string): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> => {
                if (path === '_sum/State') {
                    return Promise.reject(new Error('boom'));
                }
                return Promise.resolve(okResponse(makeChannel(path)));
            }),
        );

        const channels = await client.loadChannels();
        expect(channels.map((channel: FemsChannel): string => channel.address)).to.deep.equal(['_sum/SoC', 'ess0/SoC']);
        expect(messages.some((message: string): boolean => message.includes('boom'))).to.be.true;
    });

    it('returns an empty array if all endpoints fail', async () => {
        const { logger } = makeLogger();
        const client = new FemsClient(
            makeOptions(logger, [{ componentId: '_sum', channelId: 'SoC' }]),
            makeApiClient((): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> =>
                Promise.reject(new Error('offline')),
            ),
        );

        expect(await client.loadChannels()).to.deep.equal([]);
    });

    it('ignores responses with a non 200 status', async () => {
        const { logger } = makeLogger();
        const client = new FemsClient(
            makeOptions(logger),
            makeApiClient((): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> =>
                Promise.resolve({
                    status: 404,
                    statusText: 'Not Found',
                    headers: new AxiosHeaders(),
                    config: { headers: new AxiosHeaders() },
                    data: makeChannel('_sum/SoC'),
                }),
            ),
        );

        expect(await client.loadChannels()).to.deep.equal([]);
    });
});
