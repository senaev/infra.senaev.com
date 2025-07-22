import { UnsignedInteger } from '../../Number/UnsignedInteger';
import { HexString } from '../../String/HexString/HexString';

export function randomHexString(length: UnsignedInteger): HexString {
    let x: HexString = '';

    for (let key = 0; key < length; key++) {
        x += ((Math.random() * 16) | 0).toString(16);
    }

    return x;
}
