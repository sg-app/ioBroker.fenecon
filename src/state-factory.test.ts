import { expect } from 'chai';
import { DEFAULT_FORBIDDEN_CHARS as FORBIDDEN_CHARS } from './constants';
import type { FemsChannel } from './types';
import {
    buildChannelObject,
    buildStateObject,
    convertToFemsValue,
    convertValue,
    isWritable,
    name2id,
    resolveRole,
    resolveRoleWithSource,
    toBooleanValue,
    typeTranslation,
    unitScaleFactor,
    unitToRole,
} from './state-factory';

/**
 * Creates a FEMS channel fixture.
 *
 * @param overrides - Values that should deviate from the defaults
 * @returns A FEMS channel
 */
function makeChannel(overrides: Partial<FemsChannel> = {}): FemsChannel {
    return {
        address: '_sum/GridActivePower',
        type: 'INTEGER',
        text: 'Grid Active Power',
        accessMode: 'RO',
        unit: 'W',
        value: 100,
        ...overrides,
    };
}

describe('lib/state-factory', () => {
    describe('name2id', () => {
        it('keeps valid names untouched', () => {
            expect(name2id('_sum', FORBIDDEN_CHARS)).to.equal('_sum');
        });

        it('replaces space and other forbidden characters', () => {
            expect(name2id('my channel', FORBIDDEN_CHARS)).to.equal('my_channel');
            expect(name2id('a.b*c', FORBIDDEN_CHARS)).to.equal('a_b_c');
        });

        it('handles undefined input without throwing', () => {
            expect(name2id(undefined as unknown as string, FORBIDDEN_CHARS)).to.equal('');
        });
    });

    describe('typeTranslation', () => {
        it('maps numeric FEMS types to number', () => {
            expect(typeTranslation('INTEGER')).to.equal('number');
            expect(typeTranslation('LONG')).to.equal('number');
            expect(typeTranslation('DOUBLE')).to.equal('number');
            expect(typeTranslation('FLOAT')).to.equal('number');
        });

        it('maps the remaining known types', () => {
            expect(typeTranslation('BOOLEAN')).to.equal('boolean');
            expect(typeTranslation('STRING')).to.equal('string');
        });

        it('throws for unknown types', () => {
            expect(() => typeTranslation('UNKNOWN')).to.throw(/Unknown FEMS type/);
        });
    });

    describe('resolveRole', () => {
        it('returns the configured role for a known address', () => {
            expect(resolveRole('_sum/GridActivePower')).to.equal('value.power');
        });

        it('falls back to state for an unknown address', () => {
            expect(resolveRole('does/notExist')).to.equal('state');
        });
    });

    describe('resolveRoleWithSource', () => {
        it('reports known addresses as known', () => {
            expect(resolveRoleWithSource('_sum/GridActivePower', 'W')).to.deep.equal({
                role: 'value.power',
                known: true,
            });
        });

        it('derives the role from the unit for unknown addresses', () => {
            expect(resolveRoleWithSource('charger12/Voltage', 'V')).to.deep.equal({
                role: 'value.voltage',
                known: false,
            });
            expect(resolveRoleWithSource('charger12/Unknown', '')).to.deep.equal({ role: 'value', known: false });
        });
    });

    describe('unitToRole', () => {
        it('maps known units to roles', () => {
            expect(unitToRole('V')).to.equal('value.voltage');
            expect(unitToRole('A')).to.equal('value.current');
            expect(unitToRole('W')).to.equal('value.power');
            expect(unitToRole('kWh')).to.equal('value.energy');
            expect(unitToRole('Hz')).to.equal('value.frequency');
            expect(unitToRole('dC')).to.equal('value.temperature');
        });

        it('falls back to value for unknown units', () => {
            expect(unitToRole('')).to.equal('value');
            expect(unitToRole('bananas')).to.equal('value');
        });
    });

    describe('convertValue', () => {
        it('converts deci degrees to degrees', () => {
            expect(unitScaleFactor('dC')).to.equal(0.1);
            expect(convertValue(253, 'dC')).to.equal(25.3);
        });

        it('keeps values with other units untouched', () => {
            expect(unitScaleFactor('V')).to.equal(1);
            expect(convertValue(230, 'V')).to.equal(230);
            expect(convertValue('text', 'V')).to.equal('text');
        });
    });

    describe('convertToFemsValue', () => {
        it('converts degrees back to deci degrees', () => {
            expect(convertToFemsValue(25.3, 'dC')).to.equal(253);
        });

        it('keeps values with other units untouched', () => {
            expect(convertToFemsValue(230, 'V')).to.equal(230);
            expect(convertToFemsValue(true, 'V')).to.equal(true);
        });
    });

    describe('isWritable', () => {
        it('reports RW and WO as writable', () => {
            expect(isWritable('RW')).to.be.true;
            expect(isWritable('WO')).to.be.true;
            expect(isWritable('RO')).to.be.false;
        });
    });

    describe('buildChannelObject', () => {
        it('builds a channel object', () => {
            const channelObject = buildChannelObject('_sum');
            expect(channelObject._id).to.equal('_sum');
            expect(channelObject.type).to.equal('channel');
            expect(channelObject.common.name).to.equal('_sum');
        });
    });

    describe('buildStateObject', () => {
        it('derives common properties from the FEMS channel', () => {
            const stateObject = buildStateObject('GridActivePower', makeChannel());
            expect(stateObject.type).to.equal('state');
            expect(stateObject.common.name).to.equal('GridActivePower');
            expect(stateObject.common.desc).to.equal('Grid Active Power');
            expect(stateObject.common.role).to.equal('value.power');
            expect(stateObject.common.type).to.equal('number');
            expect(stateObject.common.unit).to.equal('W');
            expect(stateObject.common.read).to.be.true;
            expect(stateObject.common.write).to.be.false;
        });

        it('enables write for RW and WO channels only', () => {
            expect(buildStateObject('id', makeChannel({ accessMode: 'RW' })).common.write).to.be.true;
            expect(buildStateObject('id', makeChannel({ accessMode: 'WO' })).common.write).to.be.true;
            expect(buildStateObject('id', makeChannel({ accessMode: 'RO' })).common.write).to.be.false;
        });

        it('derives the role from the unit for unknown addresses', () => {
            const stateObject = buildStateObject('id', makeChannel({ address: 'unknown/address' }));
            expect(stateObject.common.role).to.equal('value.power');
        });
    });

    describe('toBooleanValue', () => {
        it('converts values to boolean', () => {
            expect(toBooleanValue(1)).to.be.true;
            expect(toBooleanValue(0)).to.be.false;
            expect(toBooleanValue('')).to.be.false;
            expect(toBooleanValue('true')).to.be.true;
            expect(toBooleanValue(null)).to.be.false;
        });
    });
});
