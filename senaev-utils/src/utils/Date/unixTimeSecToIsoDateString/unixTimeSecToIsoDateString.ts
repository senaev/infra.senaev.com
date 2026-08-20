import { ISODateString } from '../../../types/Time/ISODateString/ISODateString';
import { UnixTimeSec } from '../../../types/Time/UnixTimeSec';

export function unixTimeSecToIsoDateString(time: UnixTimeSec): ISODateString {
    return new Date(time * 1000).toISOString();
}
