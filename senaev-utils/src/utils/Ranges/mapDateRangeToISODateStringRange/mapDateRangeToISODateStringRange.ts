import { RangeTuple } from '../../../types/RangeTuple';
import { ISODateString } from '../../../types/Time/ISODateString/ISODateString';
import { mapRange } from '../mapRange/mapRange';

export function mapDateRangeToISODateStringRange(range: RangeTuple<Date>): RangeTuple<ISODateString> {
    return mapRange(range, (date) => date.toISOString());
}
