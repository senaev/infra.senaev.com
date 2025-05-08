import { getObjectKeys } from '../../util/Object/getObjectKeys/getObjectKeys';
import { mirrorObject } from '../../util/Object/mirrorObject/mirrorObject';

/**
 * Tinkoff присылает в строках, цифры для хранения
 */
export const TinkoffApiCandleResponseSourceType = {
    CANDLE_SOURCE_UNSPECIFIED: 0,
    CANDLE_SOURCE_DEALER_WEEKEND: 1,
    CANDLE_SOURCE_EXCHANGE: 2,
} as const;

export const TinkoffApiCandleResponseSourceTypes = mirrorObject(TinkoffApiCandleResponseSourceType);
export const TinkoffApiCandleResponseSourceTypesArray = getObjectKeys(TinkoffApiCandleResponseSourceType);

export function isValidTinkoffApiCandleResponseSourceType(sourceType: string): sourceType is TinkoffApiCandleResponseSourceTypeName {
    return Object.hasOwn(TinkoffApiCandleResponseSourceType, sourceType);
}

export type TinkoffApiCandleResponseSourceTypeName = keyof typeof TinkoffApiCandleResponseSourceType;
export type TinkoffApiCandleResponseSourceTypeValue = (typeof TinkoffApiCandleResponseSourceType)[TinkoffApiCandleResponseSourceTypeName];
