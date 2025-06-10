import crypto from 'node:crypto';

/**
 * Get independent values from hash sized for experiments
 */
export function generateHashedFloats(seed: string, count: number, bytesPerFloat = 8): number[] {
    // Get exact number of bytes needed
    const hash = crypto
        .createHash('shake256', { outputLength: count * bytesPerFloat })
        .update(seed)
        .digest();

    const floats: number[] = [];
    for (let i = 0; i < count; i++) {
        const slice = hash.subarray(i * bytesPerFloat, (i + 1) * bytesPerFloat);
        const intValue = BigInt(`0x${slice.toString('hex')}`);
        const max = BigInt(`0x1${'0'.repeat(bytesPerFloat * 2)}`);
        const float = Number(intValue) / Number(max);

        floats.push(float);
    }

    return floats;
}
