import { MS_IN_SEC } from '../../../types/Time/Time';
import { UnixTimeSec } from '../../../types/Time/UnixTimeSec';

export function dateToUnixTimeSec(date: Date): UnixTimeSec {
    return Math.floor(date.getTime() / MS_IN_SEC);
}
