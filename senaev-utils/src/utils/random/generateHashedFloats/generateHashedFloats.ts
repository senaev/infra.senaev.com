import crypto from 'node:crypto';

/**
 * Get independent values from hash sized for experiments
 */
export function generateHashedFloats(seed: string, count: number): number[] {
    // 6 bytes is the maximum for buffer.readUIntBE method
    const BYTES_PER_INT = 6;
    const MAX_INT = 2 ** (BYTES_PER_INT * 8) - 1;

    // Get exact number of bytes needed
    const buffer = crypto
        .createHash('shake256', { outputLength: count * BYTES_PER_INT })
        .update(seed)
        .digest();

    const floats: number[] = [];

    for (let i = 0; i < count; i++) {
        const offset = i * BYTES_PER_INT;
        const intValue = buffer.readUIntBE(offset, BYTES_PER_INT);
        const float = intValue / MAX_INT;

        floats.push(float);
    }

    return floats;
}
