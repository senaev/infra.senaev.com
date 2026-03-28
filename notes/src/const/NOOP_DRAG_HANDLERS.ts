import { DragHandlers } from "../types/DragHandlers";
import { noop } from "../utils/noop";

export const NOOP_DRAG_HANDLERS: DragHandlers = {
    start: noop,
    move: noop,
    stop: noop,
};
