import { GlobalContext } from '../../../types/GlobalContext';

/**
 * The check returns true for devices
 * where the PRIMARY mechanism of interaction with the user is a touchscreen
 *
 * This is the easiest way, primitive, but effective way to separate mobile and desktop devices
 *
 * For example, on a laptop with a touchscreen, this utility should return false
 * (since there is a touchscreen, but it's not the primary way of interaction,
 * the user most likely uses a touchpad),
 * while on a tablet with a keyboard - true
 */
export function isTouchScreenDevice(win: Pick<GlobalContext, 'ontouchstart'>): boolean {
    return 'ontouchstart' in win;
}
