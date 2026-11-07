import { expect } from 'chai';
import { definitions, statesByAddress } from './states';
import type { StateDefinition } from './types';

describe('lib/states', () => {
    it('contains channel definitions', () => {
        expect(definitions.length).to.be.greaterThan(0);
    });

    it('builds a lookup map with one entry per definition', () => {
        expect(statesByAddress.size).to.equal(definitions.length);
    });

    it('does not contain duplicate addresses', () => {
        const addresses = definitions.map((definition: StateDefinition): string => definition.address);
        expect(new Set(addresses).size).to.equal(addresses.length);
    });

    it('resolves a known address', () => {
        const definition = statesByAddress.get('_sum/GridActivePower');
        expect(definition).to.be.an('object');
        expect(definition?.role).to.equal('value.power');
    });

    it('returns undefined for an unknown address', () => {
        expect(statesByAddress.get('does/notExist')).to.be.undefined;
    });

    it('defines a role for every entry', () => {
        const withoutRole = definitions.filter((definition: StateDefinition): boolean => !definition.role);
        expect(withoutRole).to.deep.equal([]);
    });

    it('does not use the generic state role anymore', () => {
        const generic = definitions.filter((definition: StateDefinition): boolean => definition.role === 'state');
        expect(generic).to.deep.equal([]);
    });

    it('uses only known ioBroker roles', () => {
        const allowedRoles = new Set([
            'value',
            'value.voltage',
            'value.current',
            'value.power',
            'value.power.reactive',
            'value.energy',
            'value.frequency',
            'value.temperature',
            'indicator',
            'text',
            'time.span',
            'time.timeout',
            'time.interval',
        ]);
        const unknown = definitions.filter(
            (definition: StateDefinition): boolean => !allowedRoles.has(definition.role),
        );
        expect(unknown).to.deep.equal([]);
    });
});
