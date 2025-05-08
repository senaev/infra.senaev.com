import { UnixTimeSec } from '../Time/UnixTimeSec';
import { TinkoffApiCandleResponseSourceTypeName } from '../Tinkoff/TinkoffApiCandleResponseSourceType';

import { LotsCount } from './LotsCount';

export type CandleStick = {
    timestamp: UnixTimeSec;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: LotsCount;
    source: TinkoffApiCandleResponseSourceTypeName;
};
