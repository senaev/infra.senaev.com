import { isObject } from 'senaev-utils/src/types/Object/Object';

/**
 * Mirrors `milestones.schema.json` of the senaev-personal-tools Obsidian plugin, which owns
 * the config. It is read from the synced vault, so the plugin and this service always
 * apply the same rules. Only the matching rules are read: this service returns structured
 * data, so `template` and `tomorrowEmoji` are left to the plugin.
 */
export interface MilestoneType {
    property: string;
    ruleProperty?: string;
    emoji: string;
}

export interface MilestonesConfig {
    hiddenProperty: string;
    minKnownYear: number;
    types: MilestoneType[];
}

const SUPPORTED_VERSION = 1;

function requireNonEmptyString(source: Record<string, unknown>, key: string): string {
    const value = source[key];

    if (typeof value !== 'string' || value === '') {
        throw new Error(`Milestones config: "${key}" must be a non-empty string`);
    }

    return value;
}

function parseMilestoneType(value: unknown, index: number): MilestoneType {
    if (!isObject(value)) {
        throw new Error(`Milestones config: types[${index}] must be an object`);
    }

    const type: MilestoneType = {
        property: requireNonEmptyString(value, 'property'),
        emoji: requireNonEmptyString(value, 'emoji'),
    };

    if (value.ruleProperty !== undefined) {
        type.ruleProperty = requireNonEmptyString(value, 'ruleProperty');
    }

    return type;
}

export function parseMilestonesConfig(value: unknown): MilestonesConfig {
    if (!isObject(value)) {
        throw new Error('Milestones config must be a JSON object');
    }

    if (value.version !== SUPPORTED_VERSION) {
        throw new Error(`Milestones config: unsupported version ${String(value.version)}, expected ${SUPPORTED_VERSION}`);
    }

    const { minKnownYear, types } = value;

    if (typeof minKnownYear !== 'number' || !Number.isInteger(minKnownYear)) {
        throw new Error('Milestones config: "minKnownYear" must be an integer');
    }

    if (!Array.isArray(types) || types.length === 0) {
        throw new Error('Milestones config: "types" must be a non-empty array');
    }

    return {
        hiddenProperty: requireNonEmptyString(value, 'hiddenProperty'),
        minKnownYear,
        types: types.map(parseMilestoneType),
    };
}
