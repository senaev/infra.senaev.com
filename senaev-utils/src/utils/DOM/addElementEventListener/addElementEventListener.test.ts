// @vitest-environment jsdom

import {
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import { addElementEventListener } from './addElementEventListener';

describe('addElementEventListener', () => {
    test('should call listener on event', () => {
        const element = document.createElement('div');
        const listener = vi.fn();

        addElementEventListener({
            element,
            eventName: 'click',
            listener,
        });

        element.click();

        expect(listener.mock.calls.length).toBe(1);
        expect(listener.mock.calls[0]![0]).toBeInstanceOf(MouseEvent);
    });

    test('should stop calling listener after teardown', () => {
        const element = document.createElement('div');
        const listener = vi.fn();

        const teardown = addElementEventListener({
            element,
            eventName: 'click',
            listener,
        });

        element.click();
        teardown();
        element.click();

        expect(listener.mock.calls.length).toBe(1);
    });

    test('should pass options through', () => {
        const element = document.createElement('div');
        const listener = vi.fn();

        addElementEventListener({
            element,
            eventName: 'click',
            listener,
            options: { once: true },
        });

        element.click();
        element.click();

        expect(listener.mock.calls.length).toBe(1);
    });
});
