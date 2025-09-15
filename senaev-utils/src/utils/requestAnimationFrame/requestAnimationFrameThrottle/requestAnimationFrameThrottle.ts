import { throttleWithPromiseFunction } from '../../Function/throttleWithPromiseFunction/throttleWithPromiseFunction';
import { requestAnimationFramePromise } from '../requestAnimationFramePromise/requestAnimationFramePromise';

export function requestAnimationFrameThrottle(callback: VoidFunction) {
    return throttleWithPromiseFunction(callback, requestAnimationFramePromise);
}
