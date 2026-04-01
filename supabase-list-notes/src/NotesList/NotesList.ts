import { NotesListTable } from "../tables/NotesListTable";

export type NoteRecord = {
    id: number;
    title: string;
    created: string;
    updated: string;
    items_count: number;
    undone_items_count: number;
};

export class NotesList {
    public items: NoteRecord[] | undefined = undefined;

    constructor(
        private readonly params: {
            notesListTable: NotesListTable;
            onChange: () => void;
            showError: (message: string) => void;
        },
    ) {
        this.params.notesListTable
            .readAll()
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
                this.params.showError(`Failed to load notes: ${err.message}`);
            });
    }

    public async createNewOne(): Promise<NoteRecord> {
        const newNote = await this.params.notesListTable.create({ title: "" });

        this.items = [
            ...this.items!,
            {
                ...newNote,
                items_count: 0,
                undone_items_count: 0,
            },
        ];

        return {
            ...newNote,
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
            await this.params.notesListTable.update(id, { title });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.params.showError(`Failed to update note title: ${message}`);
        }
    }

    public async delete(id: number): Promise<void> {
        const { items } = this;

        if (!items) {
            this.params.showError("Notes are not loaded yet");
            return;
        }

        try {
            this.items = items.filter((item) => item.id !== id);
            this.params.onChange();

            await this.params.notesListTable.delete(id);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.params.showError(`Failed to delete note: ${message}`);
        }
    }
}
