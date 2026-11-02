/**
 * Calculates the autarchy rate in percent.
 *
 * The autarchy describes the share of the consumption that was covered by the
 * own production. It is only defined if the grid consumption is not negative,
 * which would mean that the system is feeding into the grid.
 *
 * @param gridActivePower - Grid active power in W (negative means feeding into the grid)
 * @param consumptionActivePower - Consumption active power in W
 * @returns The autarchy rate between 0 and 100, or `null` if it cannot be calculated
 */
export function calculateAutarchy(
    gridActivePower: number | null,
    consumptionActivePower: number | null,
): number | null {
    if (gridActivePower === null || consumptionActivePower === null || consumptionActivePower <= 0) {
        return null;
    }

    return Math.round(Math.max(0, Math.min(100, (1 - gridActivePower / consumptionActivePower) * 100)));
}

/**
 * Calculates the self consumption rate in percent.
 *
 * The self consumption describes the share of the production that was consumed
 * instead of being fed into the grid. Selling to the grid is expressed as a
 * negative grid active power, so its absolute value is used here.
 *
 * @param gridActivePower - Grid active power in W (negative means feeding into the grid)
 * @param productionActivePower - Production active power in W
 * @returns The self consumption rate between 0 and 100, or `null` if it cannot be calculated
 */
export function calculateSelfConsumption(
    gridActivePower: number | null,
    productionActivePower: number | null,
): number | null {
    if (productionActivePower === null || productionActivePower <= 0) {
        return null;
    }

    const sellToGrid = gridActivePower === null ? 0 : Math.abs(gridActivePower);
    const selfConsumption = (1 - sellToGrid / productionActivePower) * 100;

    return Math.max(0, Math.min(100, Math.floor(selfConsumption)));
}
