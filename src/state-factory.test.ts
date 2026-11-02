import { expect } from 'chai';
import { DEFAULT_FORBIDDEN_CHARS as FORBIDDEN_CHARS } from './constants';
import type { FemsChannel } from './types';
import {
    buildChannelObject,
    buildStateObject,
    name2id,
    resolveRole,
    toBooleanValue,
    typeTranslation,
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

        it('enables write for RW channels only', () => {
            expect(buildStateObject('id', makeChannel({ accessMode: 'RW' })).common.write).to.be.true;
            expect(buildStateObject('id', makeChannel({ accessMode: 'RO' })).common.write).to.be.false;
        });

        it('falls back to the state role for unknown addresses', () => {
            const stateObject = buildStateObject('id', makeChannel({ address: 'unknown/address' }));
            expect(stateObject.common.role).to.equal('state');
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
