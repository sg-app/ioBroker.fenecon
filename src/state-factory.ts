import type { FemsAccessMode, FemsChannel, StateDefinition } from './types';
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
 * Resolves the ioBroker role for a FEMS address and reports its source.
 *
 * Known addresses use the role of the mapping table. Unknown addresses fall
 * back to a role derived from the unit, so that the adapter does not have to
 * fall back to the generic `state` role for every new channel.
 *
 * @param address - Full FEMS address, e.g. `_sum/GridActivePower`
 * @param unit - Unit of the channel, used as fallback
 * @returns The role and whether it was derived from the mapping table
 */
export function resolveRoleWithSource(address: string, unit: string): { role: string; known: boolean } {
    const definition: StateDefinition | undefined = statesByAddress.get(address);
    if (definition) {
        return { role: definition.role, known: true };
    }

    return { role: unitToRole(unit), known: false };
}

/**
 * Derives an ioBroker role from a FEMS unit as a last resort.
 *
 * @param unit - Unit of the channel
 * @returns A role matching the unit or `value` if the unit is unknown
 */
export function unitToRole(unit: string): string {
    const unitRoles: Record<string, string> = {
        V: 'value.voltage',
        mV: 'value.voltage',
        A: 'value.current',
        mA: 'value.current',
        W: 'value.power',
        VA: 'value.power',
        var: 'value.power.reactive',
        Wh: 'value.energy',
        Wh_Σ: 'value.energy',
        kWh: 'value.energy',
        '€/MWh': 'value',
        Hz: 'value.frequency',
        mHz: 'value.frequency',
        '°C': 'value.temperature',
        dC: 'value.temperature',
        C: 'value.temperature',
        ms: 'time.span',
        s: 'time.span',
        sec: 'time.span',
        sec_Σ: 'time.span',
        '%': 'value',
        '‰': 'value',
    };

    return unitRoles[unit] ?? 'value';
}

/**
 * Returns the factor a FEMS value must be multiplied with to match the
 * ioBroker unit conventions. Most units are delivered in the expected scale.
 *
 * @param unit - Unit of the channel
 * @returns The conversion factor, `1` if no conversion is needed
 */
export function unitScaleFactor(unit: string): number {
    // FEMS delivers temperatures in deci degrees Celsius (dC)
    return unit === 'dC' ? 0.1 : 1;
}

/**
 * Converts a raw FEMS value into the ioBroker unit scale.
 *
 * @param value - Raw value delivered by the FEMS API
 * @param unit - Unit of the channel
 * @returns The converted value
 */
export function convertValue(value: ioBroker.StateValue, unit: string): ioBroker.StateValue {
    const factor = unitScaleFactor(unit);
    if (factor === 1 || typeof value !== 'number') {
        return value;
    }

    return value * factor;
}

/**
 * Converts an ioBroker value back into the scale expected by the FEMS API.
 *
 * This is the inverse of {@link convertValue} and is used when a value is
 * written back to FEMS.
 *
 * @param value - Value coming from an ioBroker state
 * @param unit - Unit of the channel
 * @returns The value in the FEMS scale
 */
export function convertToFemsValue(value: ioBroker.StateValue, unit: string): ioBroker.StateValue {
    const factor = unitScaleFactor(unit);
    if (factor === 1 || typeof value !== 'number') {
        return value;
    }

    return value / factor;
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
            role: resolveRoleWithSource(channel.address, channel.unit).role,
            // Only RW and WO channels may be written back to FEMS.
            write: channel.accessMode === 'RW' || channel.accessMode === 'WO',
            read: channel.accessMode === 'RO' || channel.accessMode === 'RW',
            type: typeTranslation(channel.type),
            unit: channel.unit,
        },
        native: {},
    };
}

/**
 * Checks whether a FEMS access mode allows writing a value.
 *
 * @param accessMode - Access mode delivered by the FEMS API
 * @returns `true` if the channel can be written
 */
export function isWritable(accessMode: FemsAccessMode): boolean {
    return accessMode === 'RW' || accessMode === 'WO';
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
