import type { TrickyDadSource } from '../TrickyDadSource';

export type TrickyDadActionContext = {
    command: string;
    source: TrickyDadSource;
};

/** An action with validated arguments, ready to run. */
export type PlannedTrickyDadAction = {
    type: string;
    emoji: string;
    /** The chat that gets the report about this action. */
    reportChatId: string;
    /** What the action does, one report line per entry, for example the added items. */
    entries: string[];
    /** Returns extra report lines, for example the items that a read action found. */
    run: (context: TrickyDadActionContext) => Promise<string[]>;
};

/**
 * One thing that Tricky Dad can do. A new action is a new file with this shape, set as the
 * action of a source in `TrickyDadSource.ts`.
 */
export type TrickyDadAction = {
    type: string;
    /** Prompt lines that tell the model how to fill the arguments. */
    instructions: string[];
    /** JSON schema properties of the arguments, without `type`. All of them are required. */
    argsProperties: Record<string, Record<string, unknown>>;
    /** Validates the arguments from the model. Throws when they are not usable. */
    parseArgs: (args: Record<string, unknown>) => PlannedTrickyDadAction;
    /** Builds the action from the raw command, when the model gave no usable answer. */
    fromRawCommand: (command: string) => PlannedTrickyDadAction;
};
