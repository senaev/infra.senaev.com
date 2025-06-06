import { HEX_SYMBOLS } from './HEX_SYMBOLS';
import { HexString } from './HexString';

export function isHexString(str: unknown): str is HexString {
    if (typeof str !== 'string') {
        return false;
    }

    for (let key = 0; key < str.length; key++) {
        if (HEX_SYMBOLS.indexOf(str[key].toLowerCase()) < 0) {
            return false;
        }
    }

    return true;
}
