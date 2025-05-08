/**
 * https://developer.tbank.ru/invest/api/instruments-service-bonds
 */
export const TinkoffApiInstrumentStatus = {
    /**
     * Значение не определено
     */
    INSTRUMENT_STATUS_UNSPECIFIED: 0,
    /**
     * По умолчанию — базовый список инструментов, которыми можно торговать через T-Invest API.
     * Сейчас (2025-01-16) списки доступных бумаг в API и других интерфейсах совпадают — кроме внебиржевых бумаг,
     * но в будущем списки могут различаться.
     */
    INSTRUMENT_STATUS_BASE: 1,
    /**
     * Список всех инструментов.
     */
    INSTRUMENT_STATUS_ALL: 2,
} as const;

export type TinkoffApiInstrumentStatusName = keyof typeof TinkoffApiInstrumentStatus;

export type TinkoffApiInstrumentStatusValue = (typeof TinkoffApiInstrumentStatus)[TinkoffApiInstrumentStatusName];
