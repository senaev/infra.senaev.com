import { DisksUsage, getDiskUsage } from "./getDiskUsage";

export async function getSpaceInfoToRemove({
    folderToCheckUsage,
    percentTriggerToRemove,
    percentRemoveTarget,
}: {
    folderToCheckUsage: string;
    percentTriggerToRemove: number;
    percentRemoveTarget: number;
}): Promise<{
    usage: DisksUsage;
    occupiedPercent: number;
    removeInfo?: {
        percentToRemove: number;
        bytesToRemove: number;
    };
}> {
    const usage = await getDiskUsage(folderToCheckUsage);
    const { totalBlocks, availableBlocks, blockSize } = usage;
    const usedBlocks = totalBlocks - availableBlocks;
    const occupiedPercent = (usedBlocks / totalBlocks) * 100;

    if (occupiedPercent < percentTriggerToRemove) {
        return {
            usage,
            occupiedPercent,
        };
    }

    const percentToRemove = occupiedPercent - percentRemoveTarget;
    const bytesToRemove = ((totalBlocks * percentToRemove) / 100) * blockSize;
    return {
        usage,
        occupiedPercent,
        removeInfo: {
            percentToRemove,
            bytesToRemove,
        },
    };
}
