export type NoteItem = {
    id: number;
    list_id: number;
    title: string;
    position: number;
    created: string;
    updated: string;
    update_index: number;
    check_time: string | null;
    persisted: boolean;
    child: boolean;
};
