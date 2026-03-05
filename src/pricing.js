/**
 * Model Pricing — shared across hookProcessor and sessionScanner
 */

'use strict';

const MODEL_PRICING = {
    'claude-opus-4-5': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-sonnet-4-5': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-4-5': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
    'claude-opus-4-6': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-4-6': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
};

const DEFAULT_PRICING = { input: 3 / 1_000_000, output: 15 / 1_000_000 };

/**
 * Round cost to 5 decimal places
 * @param {number} cost
 * @returns {number}
 */
function roundCost(cost) {
    return Math.round(cost * 100000) / 100000;
}

module.exports = { MODEL_PRICING, DEFAULT_PRICING, roundCost };
