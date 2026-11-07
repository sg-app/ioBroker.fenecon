import { expect } from 'chai';
import { calculateAutarchy, calculateSelfConsumption } from './calculations';

describe('lib/calculations', () => {
    describe('calculateAutarchy', () => {
        it('returns null if there is no consumption', () => {
            expect(calculateAutarchy(-500, 0)).to.equal(null);
            expect(calculateAutarchy(-500, -100)).to.equal(null);
        });

        it('computes the share covered by the own production', () => {
            // 500 W of 2000 W are taken from the grid => 75 % autarchy
            expect(calculateAutarchy(500, 2000)).to.equal(75);
            expect(calculateAutarchy(0, 2000)).to.equal(100);
        });

        it('clamps feeding into the grid to 100 percent', () => {
            // feeding into the grid cannot be represented as autarchy
            expect(calculateAutarchy(-500, 2000)).to.equal(100);
            expect(calculateAutarchy(-40, 2000)).to.equal(100);
        });

        it('clamps the result to the range between 0 and 100', () => {
            expect(calculateAutarchy(5000, 2000)).to.equal(0);
        });

        it('returns null if a value is missing', () => {
            expect(calculateAutarchy(null, 2000)).to.equal(null);
            expect(calculateAutarchy(500, null)).to.equal(null);
        });
    });

    describe('calculateSelfConsumption', () => {
        it('computes the share consumed instead of feeding into the grid', () => {
            // 1000 W of 2000 W are fed into the grid => 50 % self consumption
            expect(calculateSelfConsumption(-1000, 2000)).to.equal(50);
        });

        it('returns 100 percent if nothing is fed into the grid', () => {
            expect(calculateSelfConsumption(0, 2000)).to.equal(100);
        });

        it('returns 100 percent when buying from the grid', () => {
            // producing 2000 W but consuming 3000 W => buying 1000 W from the grid
            // => nothing is fed in => 100 % self consumption
            expect(calculateSelfConsumption(1000, 2000)).to.equal(100);
        });

        it('clamps the result to the range between 0 and 100', () => {
            expect(calculateSelfConsumption(-5000, 2000)).to.equal(0);
        });

        it('returns null if there is no production', () => {
            expect(calculateSelfConsumption(-1000, 0)).to.equal(null);
            expect(calculateSelfConsumption(-1000, null)).to.equal(null);
        });

        it('treats a missing grid value as zero', () => {
            expect(calculateSelfConsumption(null, 2000)).to.equal(100);
        });
    });
});
