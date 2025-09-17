import { useRef, useState } from 'react';

import {
    VisualizedProcessesTree,
    VisualizedProcessesTreeChange,
    VisualizedProcessesTreeChangeAdd, VisualizedProcessesTreeChangeDelete, VisualizedProcessesTreeChangeStatus,
} from '../utils/AbortableProcess';
import { prettyStringify } from '../utils/prettyStringify';

type Node = {
    parentId: VisualizedProcessesTree['id'] | null;
    node: VisualizedProcessesTree;
};

type AllNodesMap = Map<
    VisualizedProcessesTree['id'],
    Node
>;

function reconstructAllNodesMap(allNodesMap: AllNodesMap, tree: VisualizedProcessesTree): void {
    allNodesMap.clear();

    const stack: {
        node: VisualizedProcessesTree;
        parent: VisualizedProcessesTree['id'] | null;
    }[] = [
        {
            node: tree,
            parent: null,
        },
    ];

    while (stack.length) {
        const { node, parent } = stack.shift()!;

        allNodesMap.set(node.id, {
            parentId: parent,
            node,
        });

        for (let i = node.children.length - 1; i >= 0; i--) {
            stack.push({
                node: node.children[i],
                parent: node.id,
            });
        }
    }
}

function addNodeToAllNodesMap(allNodesMap: AllNodesMap, change: VisualizedProcessesTreeChangeAdd): void {
    const {
        id,
        name,
        parentId,
        startTimestamp,
    } = change;

    const parentNode = allNodesMap.get(parentId);

    if (!parentNode) {
        throw new Error(`Parent node is not found in tree for change=[${prettyStringify(change)}]`);
    }

    const newNode = {
        id,
        name,
        status: undefined,
        startTimestamp,
        children: [],
    };

    parentNode.node.children.push(newNode);

    allNodesMap.set(id, {
        parentId,
        node: newNode,
    });

}

function deleteNodeFromAllNodesMap(allNodesMap: AllNodesMap, change: VisualizedProcessesTreeChangeDelete): void {
    const {
        id,
    } = change;

    const node = allNodesMap.get(id);

    if (!node) {
        throw new Error(`Node is not found in tree for change=[${prettyStringify(change)}]`);
    }

    const { parentId } = node;

    if (!parentId) {
        throw new Error(`Cannot remove node without parent for change=[${prettyStringify(change)}]`);
    }

    const parentNode = allNodesMap.get(parentId);

    if (!parentNode) {
        throw new Error(`Parent node is not found in tree for change=[${prettyStringify(change)}]`);
    }

    const nodeIndex = parentNode.node.children.indexOf(node.node);

    if (nodeIndex === -1) {
        throw new Error(`Child node is not found the parent node "children" array for change=[${prettyStringify(change)}]`);
    }

    parentNode.node.children.splice(nodeIndex, 1);
}

function changeNodeStatusInAllNodesMap(allNodesMap: AllNodesMap, change: VisualizedProcessesTreeChangeStatus): void {
    const {
        id,
        status,
    } = change;

    const node = allNodesMap.get(id);

    if (!node) {
        throw new Error(`Node is not found in tree for change=[${prettyStringify(change)}]`);
    }

    node.node.status = status;
}

function getTreeForParentNodeWithId(allNodesMap: AllNodesMap, parentId: VisualizedProcessesTree['id']): VisualizedProcessesTree {
    const parentNode = allNodesMap.get(parentId);

    if (!parentNode) {
        throw new Error(`Parent node is not found in tree for parentId=[${parentId}]`);
    }

    return parentNode.node;
}

export function useVisualizedProcessesTree(): {
    tree: VisualizedProcessesTree | null;
    setTree: (tree: VisualizedProcessesTree) => void;
    handleChanges: (changes: VisualizedProcessesTreeChange[]) => void;
} {
    const [
        tree,
        setTree,
    ] = useState<VisualizedProcessesTree | null>(null);

    const allNodesMapRef = useRef<AllNodesMap>(new Map());

    return {
        tree,
        setTree: (nextTree: VisualizedProcessesTree) => {
            const allNodesMap = allNodesMapRef.current;

            reconstructAllNodesMap(allNodesMap, nextTree);

            const parentId = nextTree.id;
            const nextTreeToDraw = getTreeForParentNodeWithId(allNodesMap, parentId);

            setTree(nextTreeToDraw);
        },
        handleChanges: (changes) => {
            const allNodesMap = allNodesMapRef.current;

            changes.forEach((change) => {
                const { type } = change;

                if (type === 'add') {
                    addNodeToAllNodesMap(allNodesMap, change);

                    return;
                }

                if (type === 'delete') {
                    deleteNodeFromAllNodesMap(allNodesMap, change);

                    return;
                }

                if (type === 'status') {
                    changeNodeStatusInAllNodesMap(allNodesMap, change);

                    return;
                }

                throw new Error(`Unknown event type=[${type}] for change=[${prettyStringify(change)}]`);
            });

            setTree((previousTree) => {
                if (!previousTree) {
                    throw new Error('Initial tree has NOT been set');
                }

                const parentId = previousTree.id;
                const nextTreeToDraw = getTreeForParentNodeWithId(allNodesMap, parentId);

                return {
                    ...nextTreeToDraw,
                };
            });
        },
    };
}
