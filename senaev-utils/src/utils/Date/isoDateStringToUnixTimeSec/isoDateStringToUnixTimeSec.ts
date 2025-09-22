import { ISODateString } from '../../../types/Time/ISODateString/ISODateString';
import { UnixTimeSec } from '../../../types/Time/UnixTimeSec';
import { isoDateStringToUnixTimeMs } from '../isoDateStringToUnixTimeMs/isoDateStringToUnixTimeMs';

export function isoDateStringToUnixTimeSec(date: ISODateString): UnixTimeSec {
    return Math.floor(isoDateStringToUnixTimeMs(date) / 1000);
}
