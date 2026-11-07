/**
 * Micro benchmark for the per cycle work of the fenecon adapter.
 *
 * It measures the CPU bound part of one poll cycle:
 *   - JSON.parse of a realistic FEMS response
 *   - validation of the response
 *   - the per channel processing loop (id building, role/type mapping,
 *     value conversion, object signature, change detection)
 *
 * It does NOT measure network IO or the IPC to js-controller (setState /
 * extendObject), which cannot be measured without a running ioBroker instance.
 *
 * Usage: node tools/benchmark.js [iterations]
 */
'use strict';

const { performance } = require('node:perf_hooks');
const { validateChannels } = require('../build/fems-client.js');
const sf = require('../build/state-factory.js');
const { definitions } = require('../build/states.js');

const FORBIDDEN = /[.\s*?"]/g;
const ITERATIONS = Number.parseInt(process.argv[2] || '200', 10);

/**
 * Builds a synthetic FEMS response from the known state definitions.
 *
 * @returns {Array<object>}
 */
function makePayload() {
    return definitions.map(d => ({
        address: d.address,
        type: d.type,
        text: `Description of ${d.address}`,
        accessMode: d.accessMode,
        unit: d.unit,
        value: d.type === 'BOOLEAN' ? true : d.type === 'STRING' ? 'value' : 123,
    }));
}

/**
 * Reproduces the object signature used for change detection.
 *
 * @param {object} common State common properties
 * @returns {string}
 */
function signature(common) {
    return JSON.stringify([common.name, common.desc, common.role, common.type, common.unit, common.read, common.write]);
}

/**
 * Runs a single cycle and returns the phase durations.
 *
 * @param {string} json Serialized FEMS response
 * @param {{ cache: Map<string, unknown>, signatures: Map<string, string> }} warm Pre warmed caches
 * @param {number} changedCount Number of channels whose value should change
 * @param {number} tag Iteration tag used to produce changing values
 * @returns {{ parse: number, validate: number, loop: number, channels: number, writes: number }}
 */
function runCycle(json, warm, changedCount, tag) {
    const t0 = performance.now();
    const parsed = JSON.parse(json);
    const t1 = performance.now();
    const { valid } = validateChannels(parsed);
    const t2 = performance.now();

    let writes = 0;
    for (let i = 0; i < valid.length; i++) {
        const channel = valid[i];
        const [rawChannel, rawState] = channel.address.split('/');
        const channelName = sf.name2id(rawChannel, FORBIDDEN);
        const stateName = sf.name2id(rawState, FORBIDDEN);
        const type = sf.typeTranslation(channel.type);
        const baseValue =
            type === 'boolean' ? sf.toBooleanValue(channel.value) : sf.convertValue(channel.value, channel.unit);
        const value = i < changedCount ? `${baseValue}-${tag}` : baseValue;
        const id = `${channelName}.${stateName}`;

        const obj = sf.buildStateObject(stateName, channel);
        const sig = signature(obj.common);
        if (warm.signatures.get(id) !== sig) {
            warm.signatures.set(id, sig);
        }
        if (warm.cache.get(id) !== value) {
            warm.cache.set(id, value);
            writes += 1;
        }
    }
    const t3 = performance.now();

    return { parse: t1 - t0, validate: t2 - t1, loop: t3 - t2, channels: valid.length, writes };
}

/**
 * Builds a warm cache so that a cycle starts from the steady state.
 *
 * @param {Array<object>} valid Validated channels
 * @returns {{ cache: Map<string, unknown>, signatures: Map<string, string> }}
 */
function buildWarmCache(valid) {
    const cache = new Map();
    const signatures = new Map();
    for (const channel of valid) {
        const [rawChannel, rawState] = channel.address.split('/');
        const channelName = sf.name2id(rawChannel, FORBIDDEN);
        const stateName = sf.name2id(rawState, FORBIDDEN);
        const type = sf.typeTranslation(channel.type);
        const value =
            type === 'boolean' ? sf.toBooleanValue(channel.value) : sf.convertValue(channel.value, channel.unit);
        const id = `${channelName}.${stateName}`;
        cache.set(id, value);
        signatures.set(id, signature(sf.buildStateObject(stateName, channel).common));
    }
    return { cache, signatures };
}

/**
 * Benchmarks the phases.
 *
 * @param {string} label Label of the scenario
 * @param {string} json Serialized response
 * @param {number} changedCount Channels changing per cycle
 * @returns {number} Average total CPU time per cycle in ms
 */
function bench(label, json, changedCount) {
    const { valid } = validateChannels(JSON.parse(json));
    const warm = buildWarmCache(valid);

    // warm up
    for (let i = 0; i < 20; i++) {
        runCycle(json, warm, changedCount, i);
    }

    let parse = 0;
    let validate = 0;
    let loop = 0;
    let channels = 0;
    let writes = 0;
    for (let i = 0; i < ITERATIONS; i++) {
        const r = runCycle(json, warm, changedCount, i);
        parse += r.parse;
        validate += r.validate;
        loop += r.loop;
        channels = r.channels;
        writes = r.writes;
    }

    parse /= ITERATIONS;
    validate /= ITERATIONS;
    loop /= ITERATIONS;

    const total = parse + validate + loop;
    console.log(`\n${label} (${channels} channels, ${writes} writes/cycle, ${ITERATIONS} runs)`);
    console.log(`  JSON.parse        : ${parse.toFixed(3)} ms`);
    console.log(`  validate          : ${validate.toFixed(3)} ms`);
    console.log(`  processing loop   : ${loop.toFixed(3)} ms`);
    console.log(`  ------------------------------------`);
    console.log(`  total CPU / cycle : ${total.toFixed(3)} ms`);
    return total;
}

const payload = makePayload();
const json = JSON.stringify(payload);
console.log(`Payload: ${definitions.length} channels, ${(json.length / 1024).toFixed(0)} KiB JSON`);

const steady = bench('Steady state (~180 changed)', json, 180);
const full = bench('Heartbeat full write (all changed)', json, definitions.length);
const idle = bench('Idle (nothing changed)', json, 0);

console.log('\n--- rough Raspberry Pi 3 estimate ---');
console.log('The Pi 3 (Cortex-A53 @1.2GHz) is roughly 10x slower than a modern x86 core for single-threaded JS.');
console.log(`Steady state per cycle : ${steady.toFixed(1)} ms  ->  ~${(steady * 10).toFixed(0)} ms on a Pi 3`);
console.log(`Full write per cycle   : ${full.toFixed(1)} ms  ->  ~${(full * 10).toFixed(0)} ms on a Pi 3`);
console.log(`Idle per cycle         : ${idle.toFixed(1)} ms  ->  ~${(idle * 10).toFixed(0)} ms on a Pi 3`);
console.log('Note: network IO and the setState/extendObject IPC to js-controller are not included.');
