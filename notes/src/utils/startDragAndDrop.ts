export function startDragAndDrop<T extends HTMLElement>(
    event: PointerEvent,
    callback: (event: PointerEvent, isStop: boolean) => void,
) {
    const dragElement = event.target as T;
    const window = dragElement.ownerDocument.defaultView!;
    const { pointerId } = event;
    console.log("start", {
        dragElement,
        pointerId,
    });

    dragElement.setPointerCapture(pointerId);

    function handlePointerMove(nextEvent: PointerEvent) {
        console.log("move");
        if (nextEvent.pointerId !== pointerId) {
            return;
        }

        callback(nextEvent, false);
    }

    function handlePointerStop(nextEvent: PointerEvent) {
        console.log("stop");
        if (nextEvent.pointerId !== pointerId) {
            return;
        }

        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerStop);
        window.removeEventListener("pointercancel", handlePointerStop);

        if (dragElement.hasPointerCapture(pointerId)) {
            dragElement.releasePointerCapture(pointerId);
        }

        callback(nextEvent, true);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerStop);
    window.addEventListener("pointercancel", handlePointerStop);
}
