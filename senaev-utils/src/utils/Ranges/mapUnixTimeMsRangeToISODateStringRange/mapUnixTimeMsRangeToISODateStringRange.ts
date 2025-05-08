import { RangeTuple } from '../../../types/RangeTuple';
import { ISODateString } from '../../../types/Time/ISODateString/ISODateString';
import { UnixTimeMs } from '../../../types/Time/UnixTimeMs';
import { mapRange } from '../mapRange/mapRange';

export function mapUnixTimeMsRangeToISODateStringRange(range: RangeTuple<UnixTimeMs>): RangeTuple<ISODateString> {
    return mapRange(range, (timestamp) => new Date(timestamp).toISOString());
}
