import { RangeTuple } from '../../../types/RangeTuple';
import { ISODateString } from '../../../types/Time/ISODateString/ISODateString';
import { UnixTimeMs } from '../../../types/Time/UnixTimeMs';
import { mapRange } from '../mapRange/mapRange';

export function mapISODateStringRangeToUnixTimeMsRange(range: RangeTuple<ISODateString>): RangeTuple<UnixTimeMs> {
    return mapRange(range, (isoDateString) => new Date(isoDateString).getTime());
}
