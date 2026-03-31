import { ListsTable } from "../models/ListsTable";

export type OneList = {
    id: number;
    title: string;
    created: string;
    updated: string;
    items_count: number;
    undone_items_count: number;
};

export class Lists {
    public items: OneList[] | undefined = undefined;

    constructor(
        private readonly params: {
            onChange: () => void;
            showError: (message: string) => void;
        },
    ) {
        ListsTable.readAll()
            .then((data) => {
                this.items = data.map((item) => ({
                    id: item.id,
                    title: item.title,
                    created: item.created,
                    updated: item.updated,
                    items_count: item.items_count,
                    undone_items_count: item.undone_items_count,
                }));
                this.params.onChange();
            })
            .catch((err) => {
                this.params.showError(`Failed to load lists: ${err.message}`);
            });
    }

    public async createNewOne(): Promise<OneList> {
        const newList = await ListsTable.create({ title: "" });

        return {
            ...newList,
            items_count: 0,
            undone_items_count: 0,
        };
    }

    public changeTitleLocally(id: number, title: string): void {
        this.items = this.items!.map((item) => {
            if (item.id !== id) {
                return item;
            }

            return { ...item, title };
        });
        this.params.onChange();
    }

    public async persistTitle(id: number, title: string): Promise<void> {
        try {
            await ListsTable.update(id, { title });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.params.showError(`Failed to update list title: ${message}`);
        }
    }
}
