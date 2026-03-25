import { GOOGLE_KEEP_AUTH_TOKEN } from "./env.js";

const KEEP_API_URL = "https://www.googleapis.com/notes/v1/changes";
const GOOGLE_KEEP_LIST_ID = "1RdHceIxMp0j_6wbFqWsk2mXqQ8dhV8g_qKnjwE9DEza3cpSeenGtl2nEAcWxuyY";
const LIST_ITEM_SORT_DELTA = 10000;

type KeepNodeType = "LIST" | "LIST_ITEM";

type KeepTimestamps = {
    created: string;
    updated: string;
    userEdited?: string;
    deleted?: string;
    trashed?: string;
};

type KeepNodeSettings = {
    newListItemPlacement: "TOP" | "BOTTOM";
    graveyardState: "EXPANDED" | "COLLAPSED";
    checkedListItemsPolicy: "DEFAULT" | "GRAVEYARD";
};

type KeepAnnotationsGroup = {
    kind: "notes#annotationsGroup";
    annotations?: unknown[];
};

type KeepNode = {
    id: string;
    kind: "notes#node";
    type: KeepNodeType;
    parentId: string;
    sortValue: number;
    baseVersion?: number;
    text: string;
    serverId?: string;
    parentServerId?: string;
    superListItemId?: string | null;
    checked?: boolean;
    timestamps: KeepTimestamps;
    nodeSettings: KeepNodeSettings;
    annotationsGroup: KeepAnnotationsGroup;
    color?: string;
    isArchived?: boolean;
    isPinned?: boolean;
    title?: string;
    collaborators?: unknown[];
    shareRequests?: unknown[];
    labelIds?: unknown[];
};

type KeepChangesResponse = {
    toVersion: string;
    truncated: boolean;
    nodes?: KeepNode[];
    forceFullResync?: boolean;
    upgradeRecommended?: boolean;
};

function formatKeepTimestamp(date: Date): string {
    return date.toISOString();
}

function createNodeId(date: Date): string {
    const timestamp = date.getTime().toString(16);
    const randomPart = BigInt.asUintN(
        64,
        BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
    )
        .toString(16)
        .padStart(16, "0");

    return `${timestamp}.${randomPart}`;
}

function createSessionId(date: Date): string {
    const randomPart = Math.floor(1000000000 + Math.random() * 9000000000);
    return `s--${date.getTime()}--${randomPart}`;
}

async function keepChangesRequest(
    sessionId: string,
    targetVersion?: string,
    nodes?: KeepNode[],
): Promise<KeepChangesResponse> {
    const now = new Date();
    const response = await fetch(KEEP_API_URL, {
        method: "POST",
        headers: {
            Authorization: `OAuth ${GOOGLE_KEEP_AUTH_TOKEN}`,
            "Content-Type": "application/json",
            "User-Agent": "x-gkeepapi/0.17.1 (https://github.com/kiwiz/gkeepapi)",
        },
        body: JSON.stringify({
            nodes: nodes ?? [],
            clientTimestamp: formatKeepTimestamp(now),
            requestHeader: {
                clientSessionId: sessionId,
                clientPlatform: "ANDROID",
                clientVersion: {
                    major: "9",
                    minor: "9",
                    build: "9",
                    revision: "9",
                },
                capabilities: [
                    { type: "NC" },
                    { type: "PI" },
                    { type: "LB" },
                    { type: "AN" },
                    { type: "SH" },
                    { type: "DR" },
                    { type: "TR" },
                    { type: "IN" },
                    { type: "SNB" },
                    { type: "MI" },
                    { type: "CO" },
                ],
            },
            ...(targetVersion === undefined ? {} : { targetVersion }),
        }),
    });

    if (!response.ok) {
        throw new Error(`Google Keep request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { error?: { code?: number; message?: string } };
    if (data.error) {
        throw new Error(
            `Google Keep API error: ${data.error.code ?? "unknown"} ${data.error.message ?? "unknown"}`,
        );
    }

    return data as KeepChangesResponse;
}

function isDeletedOrTrashed(node: KeepNode): boolean {
    const deleted = node.timestamps.deleted;
    const trashed = node.timestamps.trashed;
    return Boolean(
        (deleted && deleted !== "1970-01-01T00:00:00.000000Z") ||
        (trashed && trashed !== "1970-01-01T00:00:00.000000Z"),
    );
}

export async function fetchAllKeepNodes(): Promise<{ nodes: KeepNode[]; version: string }> {
    const sessionId = createSessionId(new Date());
    const nodesById = new Map<string, KeepNode>();
    let targetVersion: string | undefined;
    let lastVersion = "";

    while (true) {
        const response = await keepChangesRequest(sessionId, targetVersion);
        if (response.forceFullResync) {
            throw new Error("Google Keep requested full resync");
        }
        if (response.upgradeRecommended) {
            throw new Error("Google Keep requested client upgrade");
        }

        for (const node of response.nodes ?? []) {
            nodesById.set(node.id, node);
        }

        lastVersion = response.toVersion;
        if (!response.truncated) {
            break;
        }

        targetVersion = response.toVersion;
    }

    return { nodes: [...nodesById.values()], version: lastVersion };
}

function findKeepList(nodes: KeepNode[]): KeepNode {
    const list = nodes.find(
        (node) =>
            node.type === "LIST" && node.id === GOOGLE_KEEP_LIST_ID && !isDeletedOrTrashed(node),
    );

    if (!list) {
        throw new Error(`Google Keep list not found: ${GOOGLE_KEEP_LIST_ID}`);
    }

    if (!list.serverId) {
        throw new Error(`Google Keep list has no serverId: ${GOOGLE_KEEP_LIST_ID}`);
    }

    return list;
}

function getNextSortValue(nodes: KeepNode[], listId: string): number {
    const items = nodes.filter(
        (node) =>
            node.type === "LIST_ITEM" && node.parentId === listId && !isDeletedOrTrashed(node),
    );

    if (items.length === 0) {
        return Math.floor(1000000000 + Math.random() * 9000000000);
    }

    return Math.min(...items.map((item) => item.sortValue)) - LIST_ITEM_SORT_DELTA;
}

function createUpdatedListNode(list: KeepNode, now: Date): KeepNode {
    return {
        ...list,
        timestamps: {
            ...list.timestamps,
            updated: formatKeepTimestamp(now),
            userEdited: formatKeepTimestamp(now),
        },
        annotationsGroup: list.annotationsGroup ?? { kind: "notes#annotationsGroup" },
        nodeSettings: list.nodeSettings,
        collaborators: list.collaborators ?? [],
    };
}

function createListItemNode(
    list: KeepNode,
    itemText: string,
    sortValue: number,
    now: Date,
): KeepNode {
    return {
        id: createNodeId(now),
        kind: "notes#node",
        type: "LIST_ITEM",
        parentId: list.id,
        parentServerId: list.serverId!,
        sortValue,
        text: itemText,
        superListItemId: null,
        checked: false,
        timestamps: {
            created: formatKeepTimestamp(now),
            updated: formatKeepTimestamp(now),
            userEdited: formatKeepTimestamp(now),
        },
        nodeSettings: {
            newListItemPlacement: "BOTTOM",
            graveyardState: "COLLAPSED",
            checkedListItemsPolicy: "GRAVEYARD",
        },
        annotationsGroup: {
            kind: "notes#annotationsGroup",
        },
    };
}

export async function addItemToGoogleKeepList(itemText: string): Promise<void> {
    const trimmedItemText = itemText.trim();
    if (!trimmedItemText) {
        throw new Error("Google Keep item text is empty");
    }

    const { nodes, version } = await fetchAllKeepNodes();
    const list = findKeepList(nodes);
    const now = new Date();
    const sortValue = getNextSortValue(nodes, list.id);
    const updatedListNode = createUpdatedListNode(list, now);
    const newListItemNode = createListItemNode(list, trimmedItemText, sortValue, now);

    await keepChangesRequest(createSessionId(now), version, [updatedListNode, newListItemNode]);
}
