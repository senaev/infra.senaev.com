import { SupabaseClient } from "@supabase/supabase-js";
import { NoteRecord } from "../NotesList/NotesList";
import { SplitCommaAndTrim } from "../utils/SplitCommaAndTrim";

const TABLE_NAME = "notes";
const TABLE_COLUMNS = "id, title, created, updated";
type TableColumns = SplitCommaAndTrim<typeof TABLE_COLUMNS>;

const VIEW_NAME = "notes_with_counts";
const VIEW_COLUMNS = "id, title, created, updated, items_count, undone_items_count";
type ViewColumns = SplitCommaAndTrim<typeof VIEW_COLUMNS>;

export class NotesListTable {
    constructor(private readonly supabase: SupabaseClient) {}

    public async create({ title }: { title: string }): Promise<Pick<NoteRecord, TableColumns>> {
        const { data, error } = await this.supabase
            .from(TABLE_NAME)
            .insert({ title })
            .select(TABLE_COLUMNS)
            .single();

        if (error) {
            throw new Error(`NotesListTable.create: ${error.message}`);
        }

        return data;
    }

    public async readAll(): Promise<Pick<NoteRecord, ViewColumns>[]> {
        const { error, data } = await this.supabase.from(VIEW_NAME).select(VIEW_COLUMNS);

        if (error) {
            throw new Error(`NotesListTable.readAll error: ${error.message}`);
        }

        return data;
    }

    public async update(
        id: number,
        updates: {
            title?: string;
        },
    ): Promise<void> {
        const { error } = await this.supabase
            .from(TABLE_NAME)
            .update(updates)
            .eq("id", id)
            .select(TABLE_COLUMNS)
            .single();

        if (error) {
            throw new Error(`NotesListTable.update(${id}) error: ${error.message}`);
        }
    }

    public async delete(id: number): Promise<void> {
        const { error } = await this.supabase.from(TABLE_NAME).delete().eq("id", id);

        if (error) {
            throw new Error(`NotesListTable.delete(${id}) error: ${error.message}`);
        }
    }
}
