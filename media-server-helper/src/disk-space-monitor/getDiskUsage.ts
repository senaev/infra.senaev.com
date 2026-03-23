import { statfs } from "fs/promises";

export type DisksUsage = {
    totalBlocks: number;
    availableBlocks: number;
    blockSize: number;
};

export async function getDiskUsage(path: string): Promise<DisksUsage> {
    const stats = await statfs(path);
    const totalBlocks = Number(stats.blocks);
    const availableBlocks = Number(stats.bavail);
    const blockSize = Number(stats.bsize);

    return {
        totalBlocks,
        availableBlocks,
        blockSize,
    };
}
