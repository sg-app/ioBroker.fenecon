/**
 * Rule based generator for the state mapping table in `src/states.ts`.
 *
 * The table assigns an ioBroker role to every known FEMS channel. Keeping the
 * generation in a script makes the assignment reproducible and reviewable.
 *
 * Usage:
 *   node tools/generate-states.js <path-to-states.ts> [--check]
 *
 * Without `--check` the file is rewritten in place. With `--check` the script
 * only reports whether the file is already up to date and exits with code 1 if
 * it is not.
 */
'use strict';

const fs = require('node:fs');

const ENTRY =
    /address:\s*'([^']*)',\s*type:\s*'([^']*)',\s*accessMode:\s*'([^']*)',\s*unit:\s*'([^']*)',\s*role:\s*'([^']*)'/g;

const HEADER = "import type { StateDefinition } from './types';\n\nexport const definitions: StateDefinition[] = [\n";
const FOOTER =
    '];\n\n// Lookup map for fast access by FEMS address (built once at module load)\n' +
    'export const statesByAddress: ReadonlyMap<string, StateDefinition> = new Map<string, StateDefinition>(\n' +
    '    definitions.map((definition: StateDefinition): [string, StateDefinition] => [definition.address, definition]),\n' +
    ');\n';

/**
 * Derives the role from the unit of a numeric channel.
 *
 * @param {string} unit Unit of the channel
 * @returns {string} ioBroker role
 */
function roleFromUnit(unit) {
    const byUnit = {
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
        Hz: 'value.frequency',
        mHz: 'value.frequency',
        dC: 'value.temperature',
        C: 'value.temperature',
        '°C': 'value.temperature',
        ms: 'time.span',
        s: 'time.span',
        sec: 'time.span',
        sec_Σ: 'time.span',
        min: 'time.span',
        h: 'time.span',
    };

    return byUnit[unit] || 'value';
}

/**
 * Calculates the expected role for a state definition.
 *
 * @param {string} type FEMS value type
 * @param {string} unit Unit of the channel
 * @param {string} currentRole Role currently stored in the table
 * @returns {string} The expected ioBroker role
 */
function expectedRole(type, unit, currentRole) {
    // Fix the broken role name that was produced by an earlier search & replace
    if (currentRole === 'staindicatorte') {
        return 'indicator';
    }

    // Only the generic fallback role is replaced, hand made roles are kept
    if (currentRole !== 'state') {
        return currentRole;
    }

    if (type === 'BOOLEAN') {
        return 'indicator';
    }
    if (type === 'STRING') {
        return 'text';
    }

    return roleFromUnit(unit);
}

/**
 * Parses all state definitions of the given source.
 *
 * @param {string} source Content of `src/states.ts`
 * @returns {Array<{ address: string, type: string, accessMode: string, unit: string, role: string }>}
 */
function parseDefinitions(source) {
    const definitions = [];
    let match;
    ENTRY.lastIndex = 0;
    while ((match = ENTRY.exec(source)) !== null) {
        definitions.push({
            address: match[1],
            type: match[2],
            accessMode: match[3],
            unit: match[4],
            role: match[5],
        });
    }
    return definitions;
}

/**
 * Renders a single definition as one line.
 *
 * @param {{ address: string, type: string, accessMode: string, unit: string, role: string }} definition
 * @returns {string}
 */
function renderDefinition(definition) {
    return `    { address: '${definition.address}', type: '${definition.type}', accessMode: '${definition.accessMode}', unit: '${definition.unit}', role: '${definition.role}' },`;
}

/**
 * Rewrites the whole state table, replacing generic roles.
 *
 * @param {string} source Content of `src/states.ts`
 * @returns {{ content: string, changed: number, total: number }}
 */
function rewrite(source) {
    const definitions = parseDefinitions(source);
    let changed = 0;

    for (const definition of definitions) {
        const nextRole = expectedRole(definition.type, definition.unit, definition.role);
        if (nextRole !== definition.role) {
            changed += 1;
            definition.role = nextRole;
        }
    }

    const body = definitions.map(renderDefinition).join('\n');
    const content = `${HEADER}${body}\n${FOOTER}`;

    return { content, changed, total: definitions.length };
}

/**
 * Runs the generator.
 */
function main() {
    const target = process.argv[2];
    const check = process.argv.includes('--check');

    if (!target) {
        console.error('Usage: node tools/generate-states.js <path-to-states.ts> [--check]');
        process.exit(2);
    }

    const source = fs.readFileSync(target, 'utf8');
    const { content, changed, total } = rewrite(source);

    if (check) {
        if (changed > 0) {
            console.error(`[generate-states] ${changed} of ${total} role(s) are not up to date in ${target}`);
            process.exit(1);
        }
        console.log(`[generate-states] ${target} is up to date (${total} definitions)`);
        return;
    }

    fs.writeFileSync(target, content);
    console.log(`[generate-states] updated ${changed} of ${total} role(s) in ${target}`);
}

if (require.main === module) {
    main();
}

module.exports = { rewrite, expectedRole, roleFromUnit, parseDefinitions };
