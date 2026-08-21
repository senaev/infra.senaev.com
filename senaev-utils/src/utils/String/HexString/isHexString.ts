import { HEX_SYMBOLS } from './HEX_SYMBOLS';
import { HexString } from './HexString';

export function isHexString(str: unknown): str is HexString {
    if (typeof str !== 'string') {
        return false;
    }

    for (const char of str) {
        if (HEX_SYMBOLS.indexOf(char.toLowerCase()) < 0) {
            return false;
        }
    }

    return true;
}
