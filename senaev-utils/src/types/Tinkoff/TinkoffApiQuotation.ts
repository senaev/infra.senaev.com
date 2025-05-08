import { IntegerInString } from '../Number/IntegerInString';

/**
 * https://tinkoff.github.io/investAPI/marketdata/#quotation
 */
export type TinkoffApiQuotation = {
    /**
     * Целая часть суммы, может быть отрицательным числом
     */
    units: IntegerInString;
    /**
     * Дробная часть суммы, может быть отрицательным числом
     * 💁‍♂️ 890000000
     * 💁‍♂️ 40000000
     * 💁‍♂️ 850000000
     */
    nano: number;
};
