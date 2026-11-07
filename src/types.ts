// Shared types for the Fenecon (OpenEMS/FEMS) adapter

/**
 * Value types as delivered by the FEMS REST API.
 */
export type FemsValueType = 'INTEGER' | 'LONG' | 'DOUBLE' | 'FLOAT' | 'BOOLEAN' | 'STRING';

/** All value types known from the FEMS REST API, used for runtime validation. */
export const FEMS_VALUE_TYPES: readonly FemsValueType[] = ['INTEGER', 'LONG', 'DOUBLE', 'FLOAT', 'BOOLEAN', 'STRING'];

/** All access modes known from the FEMS REST API, used for runtime validation. */
export const FEMS_ACCESS_MODES: readonly FemsAccessMode[] = ['RO', 'RW', 'WO'];

/**
 * Checks whether a value is a known FEMS value type.
 *
 * @param value - Value to check
 * @returns `true` if the value is a valid FEMS value type
 */
export function isFemsValueType(value: unknown): value is FemsValueType {
    return typeof value === 'string' && (FEMS_VALUE_TYPES as readonly string[]).includes(value);
}

/**
 * Checks whether a value is a known FEMS access mode.
 *
 * @param value - Value to check
 * @returns `true` if the value is a valid FEMS access mode
 */
export function isFemsAccessMode(value: unknown): value is FemsAccessMode {
    return typeof value === 'string' && (FEMS_ACCESS_MODES as readonly string[]).includes(value);
}

/**
 * Access mode as delivered by the FEMS REST API.
 */
export type FemsAccessMode = 'RO' | 'RW' | 'WO';

/**
 * A single channel value as returned by the FEMS REST API.
 */
export interface FemsChannel {
    /** Full address of the channel, e.g. `_sum/GridActivePower`. */
    address: string;
    /** Value type of the channel. */
    type: FemsValueType;
    /** Human readable description of the channel. */
    text: string;
    /** Access mode of the channel. */
    accessMode: FemsAccessMode;
    /** Unit of the channel value, may be an empty string. */
    unit: string;
    /** Current value of the channel. */
    value: ioBroker.StateValue;
}

/**
 * A statically known state definition, used to assign the ioBroker role.
 */
export interface StateDefinition {
    /** Full address of the channel, e.g. `_sum/GridActivePower`. */
    address: string;
    /** Value type of the channel. */
    type: FemsValueType;
    /** Access mode of the channel. */
    accessMode: FemsAccessMode;
    /** Unit of the channel value, may be an empty string. */
    unit: string;
    /** ioBroker role of the state. */
    role: string;
}
