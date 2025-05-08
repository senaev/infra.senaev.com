export const TinkoffApiCandleRequestSourceType = {
    CANDLE_SOURCE_UNSPECIFIED: 0,
    CANDLE_SOURCE_EXCHANGE: 1,
    CANDLE_SOURCE_INCLUDE_WEEKEND: 2,
} as const;

export type TinkoffApiCandleRequestSourceTypeName = keyof typeof TinkoffApiCandleRequestSourceType;
export type TinkoffApiCandleRequestSourceTypeValue = (typeof TinkoffApiCandleRequestSourceType)[TinkoffApiCandleRequestSourceTypeName];
