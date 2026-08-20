import { ISODateString } from '../../../types/Time/ISODateString/ISODateString';
import { UnixTimeMs } from '../../../types/Time/UnixTimeMs';

export function isoDateStringToUnixTimeMs(date: ISODateString): UnixTimeMs {
    return new Date(date).getTime();
}
