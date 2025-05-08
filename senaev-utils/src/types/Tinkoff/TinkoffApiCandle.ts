import { ISODateString } from '../Time/ISODateString/ISODateString';

import { TinkoffApiCandleResponseSourceTypeName } from './TinkoffApiCandleResponseSourceType';
import { TinkoffApiQuotation } from './TinkoffApiQuotation';

/**
 * https://tinkoff.github.io/investAPI/marketdata/#historiccandle
 *
 */
// 💁‍♂️ https://disk.yandex.ru/d/Ffo4Yeb3Jkz0QQ
// {
//   "open": {
//     "units": "103",
//     "nano": 890000000
//   },
//   "high": {
//     "units": "105",
//     "nano": 530000000
//   },
//   "low": {
//     "units": "103",
//     "nano": 830000000
//   },
//   "close": {
//     "units": "105",
//     "nano": 20000000
//   },
//   "volume": "2095250",
//   "time": "2025-01-08T10:00:00Z",
//   "isComplete": true,
//   "candleSourceType": "CANDLE_SOURCE_EXCHANGE"
// }
export type TinkoffApiHistoricCandle = {
    /**
     * Цена открытия за 1 инструмент.
     * Для получения стоимости лота требуется умножить на лотность инструмента.
     * Для перевод цен в валюту рекомендуем использовать информацию со страницы
     * https://tinkoff.github.io/investAPI/faq_marketdata/
     */
    // {
    //     'units': '109';
    //     'nano': 0;
    // }
    open: TinkoffApiQuotation;
    /**
     * Максимальная цена за 1 инструмент.
     * Для получения стоимости лота требуется умножить на лотность инструмента.
     * Для перевод цен в валюту рекомендуем использовать информацию со страницы
     * https://tinkoff.github.io/investAPI/faq_marketdata/
     */
    // {
    //     'units': '109';
    //     'nano': 800000000;
    // }
    high: TinkoffApiQuotation;
    /**
     * Минимальная цена за 1 инструмент.
     * Для получения стоимости лота требуется умножить на лотность инструмента.
     * Для перевод цен в валюту рекомендуем использовать информацию со страницы
     * https://tinkoff.github.io/investAPI/faq_marketdata/
     */
    // {
    //     'units': '108';
    //     'nano': 100000000;
    // }
    low: TinkoffApiQuotation;
    /**
     * Цена закрытия за 1 инструмент.
     * Для получения стоимости лота требуется умножить на лотность инструмента.
     * Для перевод цен в валюту рекомендуем использовать информацию со страницы
     * https://tinkoff.github.io/investAPI/faq_marketdata/
     */
    // {
    //     'units': '109';
    //     'nano': 340000000;
    // }
    close: TinkoffApiQuotation;
    /**
     * Объём торгов в лотах.
     */
    // '57518'
    volume: string;
    /**
     * Candle time
     */
    // '2025-01-02T04:00:00Z'
    time: ISODateString;
    /**
     * Признак завершённости свечи.
     * false значит, свеча за текущие интервал ещё сформирована не полностью.
     */
    isComplete: boolean;
    candleSourceType: TinkoffApiCandleResponseSourceTypeName;
};
