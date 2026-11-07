import { AxiosHeaders, type AxiosInstance, type AxiosResponse } from 'axios';
import { expect } from 'chai';
import {
    FemsClient,
    isValidChannel,
    validateChannels,
    type FemsClientOptions,
    type FemsEndpoint,
    type LogMessage,
    type Logger,
} from './fems-client';
import type { FemsChannel } from './types';

/**
 * Creates a logger stub that collects all messages.
 *
 * @returns The logger and the collected messages
 */
function makeLogger(): { logger: Logger; messages: string[] } {
    const messages: string[] = [];
    const resolve = (message: LogMessage): string => (typeof message === 'function' ? message() : message);
    return {
        logger: {
            debug: (message: LogMessage): void => void messages.push(`debug:${resolve(message)}`),
            silly: (message: LogMessage): void => void messages.push(`silly:${resolve(message)}`),
            error: (message: LogMessage): void => void messages.push(`error:${resolve(message)}`),
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
 * Creates an axios instance with mocked `get` and `post` methods.
 *
 * @param get - Implementation of the `get` method
 * @param post - Implementation of the `post` method
 * @returns The axios instance
 */
function makeApiClientWithPost(
    get: (path: string) => Promise<AxiosResponse<FemsChannel | FemsChannel[]>>,
    post: (path: string, body: unknown) => Promise<AxiosResponse<unknown>>,
): AxiosInstance {
    return { get, post } as unknown as AxiosInstance;
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

    it('drops invalid entries and logs them instead of creating nonsense states', async () => {
        const { logger, messages } = makeLogger();
        const client = new FemsClient(
            makeOptions(logger),
            makeApiClient((): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> =>
                Promise.resolve(
                    okResponse([
                        makeChannel('_sum/SoC'),
                        { address: 'only-one-segment', type: 'INTEGER', accessMode: 'RO', text: '', unit: '' },
                        { address: 'a/b/c', type: 'INTEGER', accessMode: 'RO', text: '', unit: '' },
                        { address: 'a/b', type: 'UNKNOWN', accessMode: 'RO', text: '', unit: '' },
                    ] as unknown as FemsChannel[]),
                ),
            ),
        );

        const channels = await client.loadChannels();
        expect(channels.map((channel: FemsChannel): string => channel.address)).to.deep.equal(['_sum/SoC']);
        expect(messages.some((message: string): boolean => message.includes('invalid'))).to.be.true;
    });

    describe('isValidChannel', () => {
        it('accepts a well formed channel', () => {
            expect(isValidChannel(makeChannel('_sum/SoC'))).to.be.true;
        });

        it('rejects addresses without exactly two segments', () => {
            expect(isValidChannel({ ...makeChannel('a/b'), address: 'a' })).to.be.false;
            expect(isValidChannel({ ...makeChannel('a/b'), address: 'a/b/c' })).to.be.false;
            expect(isValidChannel({ ...makeChannel('a/b'), address: '/b' })).to.be.false;
        });

        it('rejects unknown types and access modes', () => {
            expect(isValidChannel({ ...makeChannel('a/b'), type: 'UNKNOWN' })).to.be.false;
            expect(isValidChannel({ ...makeChannel('a/b'), accessMode: 'XX' })).to.be.false;
        });

        it('rejects non objects', () => {
            expect(isValidChannel(null)).to.be.false;
            expect(isValidChannel('<html>error</html>')).to.be.false;
        });
    });

    describe('validateChannels', () => {
        it('wraps a single valid object', () => {
            const result = validateChannels(makeChannel('ess0/SoC'));
            expect(result.valid).to.have.length(1);
            expect(result.rejected).to.deep.equal([]);
        });

        it('rejects an HTML response', () => {
            const result = validateChannels('<html>error</html>');
            expect(result.valid).to.deep.equal([]);
            expect(result.rejected).to.have.length(1);
        });

        it('separates valid from invalid entries', () => {
            const result = validateChannels([makeChannel('_sum/SoC'), 'garbage']);
            expect(result.valid).to.have.length(1);
            expect(result.rejected).to.have.length(1);
        });
    });

    describe('writeChannel', () => {
        it('posts the value to the channel url', async () => {
            const calls: { path: string; body: unknown }[] = [];
            const { logger } = makeLogger();
            const client = new FemsClient(
                makeOptions(logger),
                makeApiClientWithPost(
                    (path: string): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> =>
                        Promise.resolve(okResponse(makeChannel(path))),
                    (path: string, body: unknown): Promise<AxiosResponse<unknown>> => {
                        calls.push({ path, body });
                        return Promise.resolve({
                            status: 200,
                            statusText: 'OK',
                            headers: new AxiosHeaders(),
                            config: { headers: new AxiosHeaders() },
                            data: {},
                        });
                    },
                ),
            );

            expect(await client.writeChannel('ess0/SetActivePowerEquals', 5000)).to.be.true;
            expect(calls).to.deep.equal([{ path: 'ess0/SetActivePowerEquals', body: { value: 5000 } }]);
        });

        it('returns false and logs an error on a non 2xx status', async () => {
            const { logger, messages } = makeLogger();
            const client = new FemsClient(
                makeOptions(logger),
                makeApiClientWithPost(
                    (path: string): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> =>
                        Promise.resolve(okResponse(makeChannel(path))),
                    (): Promise<AxiosResponse<unknown>> =>
                        Promise.resolve({
                            status: 403,
                            statusText: 'Forbidden',
                            headers: new AxiosHeaders(),
                            config: { headers: new AxiosHeaders() },
                            data: {},
                        }),
                ),
            );

            expect(await client.writeChannel('ess0/SetActivePowerEquals', 5000)).to.be.false;
            expect(messages.some((message: string): boolean => message.includes('403'))).to.be.true;
        });

        it('returns false if the request fails', async () => {
            const { logger } = makeLogger();
            const client = new FemsClient(
                makeOptions(logger),
                makeApiClientWithPost(
                    (path: string): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> =>
                        Promise.resolve(okResponse(makeChannel(path))),
                    (): Promise<AxiosResponse<unknown>> => Promise.reject(new Error('offline')),
                ),
            );

            expect(await client.writeChannel('ess0/SetActivePowerEquals', 5000)).to.be.false;
        });

        it('rejects invalid addresses without sending a request', async () => {
            let posted = false;
            const { logger } = makeLogger();
            const client = new FemsClient(
                makeOptions(logger),
                makeApiClientWithPost(
                    (path: string): Promise<AxiosResponse<FemsChannel | FemsChannel[]>> =>
                        Promise.resolve(okResponse(makeChannel(path))),
                    (): Promise<AxiosResponse<unknown>> => {
                        posted = true;
                        return Promise.reject(new Error('should not be called'));
                    },
                ),
            );

            expect(await client.writeChannel('only-one-segment', 5000)).to.be.false;
            expect(posted).to.be.false;
        });
    });
});
