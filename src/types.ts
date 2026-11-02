// Shared types for the Fenecon (OpenEMS/FEMS) adapter

/**
 * Value types as delivered by the FEMS REST API.
 */
export type FemsValueType = 'INTEGER' | 'LONG' | 'DOUBLE' | 'FLOAT' | 'BOOLEAN' | 'STRING';

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
