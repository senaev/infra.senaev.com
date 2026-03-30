import { ListsTable } from "../models/ListsTable";

export type List = {
    id: number;
    title: string;
};

export class Lists {
    public items: List[] | undefined = undefined;

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
                }));
                this.params.onChange();
            })
            .catch((err) => {
                this.params.showError(`Failed to load lists: ${err.message}`);
            });
    }
}
