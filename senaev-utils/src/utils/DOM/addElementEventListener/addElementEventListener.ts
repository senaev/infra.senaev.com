export type HTMLElementEventName = keyof HTMLElementEventMap;

export type HTMLElementEventListener<K extends HTMLElementEventName> = (this: void, event: HTMLElementEventMap[K]) => void;

export type AddElementEventListenerParams<K extends HTMLElementEventName> = {
    element: HTMLElement;
    eventName: K;
    listener: HTMLElementEventListener<K>;
    options?: AddEventListenerOptions | boolean;
};

/**
 * Подписывается на событие элемента и возвращает функцию отписки
 */
export function addElementEventListener<K extends HTMLElementEventName>({
    element,
    eventName,
    listener,
    options,
}: AddElementEventListenerParams<K>): VoidFunction {
    element.addEventListener(eventName, listener, options);

    return () => {
        element.removeEventListener(eventName, listener, options);
    };
}
