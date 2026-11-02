import type { FemsChannel, StateDefinition } from './types';
import { statesByAddress } from './states';

/**
 * Replaces ioBroker forbidden characters in a FEMS name.
 *
 * @param name - Raw name delivered by the FEMS API
 * @param forbiddenChars - RegExps that matches the forbidden characters (usually `adapter.FORBIDDEN_CHARS`)
 * @returns The name usable as ioBroker object id part
 */
export function name2id(name: string, forbiddenChars: RegExp): string {
    return (name || '').replace(forbiddenChars, '_');
}

/**
 * Maps a FEMS value type to the corresponding ioBroker type.
 *
 * @param inType - Value type delivered by the FEMS API
 * @returns The ioBroker type of the state
 */
export function typeTranslation(inType: string): ioBroker.CommonType {
    switch (inType) {
        case 'INTEGER':
        case 'LONG':
        case 'DOUBLE':
        case 'FLOAT':
            return 'number';
        case 'BOOLEAN':
            return 'boolean';
        case 'STRING':
            return 'string';
        default:
            throw new Error(`[typeTranslation] Unknown FEMS type: ${inType}`);
    }
}

/**
 * Resolves the ioBroker role for a FEMS address.
 *
 * @param address - Full FEMS address, e.g. `_sum/GridActivePower`
 * @returns The configured role or `state` if the address is unknown
 */
export function resolveRole(address: string): string {
    const definition: StateDefinition | undefined = statesByAddress.get(address);
    return definition?.role ?? 'state';
}

/**
 * Builds the ioBroker channel object for a FEMS component.
 *
 * @param channelName - Sanitized channel name
 * @returns The channel object ready for `extendObject`
 */
export function buildChannelObject(
    channelName: string,
): Pick<ioBroker.ChannelObject, '_id' | 'type' | 'common' | 'native'> {
    return {
        _id: channelName,
        type: 'channel',
        common: {
            name: channelName,
        },
        native: {},
    };
}

/**
 * Builds the ioBroker state object for a FEMS channel value.
 *
 * @param stateName - Sanitized state name
 * @param channel - Channel meta data delivered by the FEMS API
 * @returns The state object ready for `extendObject`
 */
export function buildStateObject(
    stateName: string,
    channel: FemsChannel,
): Pick<ioBroker.StateObject, 'type' | 'common' | 'native'> {
    return {
        type: 'state',
        common: {
            name: stateName,
            desc: channel.text,
            role: resolveRole(channel.address),
            write: channel.accessMode === 'RW' || channel.accessMode === 'WO',
            read: channel.accessMode === 'RO' || channel.accessMode === 'RW',
            type: typeTranslation(channel.type),
            unit: channel.unit,
        },
        native: {},
    };
}

/**
 * Converts a FEMS value type to a boolean value.
 *
 * @param value - Raw value delivered by the FEMS API
 * @returns The value as boolean
 */
export function toBooleanValue(value: ioBroker.StateValue): boolean {
    return !!value;
}
