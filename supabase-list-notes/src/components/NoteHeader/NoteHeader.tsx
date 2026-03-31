import { ArrowLeftIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../const/ROUTES";
import { UNTITLED_PLACEHOLDER } from "../../const/UNTITLED_PLACEHOLDER";
import { useNotesListContext } from "../../contexts/NotesListContext";
import { PageHeader } from "../PageHeader/PageHeader";
import "./NoteHeader.css";

export function NoteHeader({ noteId }: { noteId: number }) {
    const navigate = useNavigate();

    const notes = useNotesListContext();

    function handleListTitleChange(title: string) {
        notes.changeTitleLocally(noteId, title);
        notes.persistTitle(noteId, title);
    }

    const listTitle = notes.items?.find((list) => list.id === noteId)?.title;
    return (
        <PageHeader homeButtonIcon={<ArrowLeftIcon className="NoteHeader__icon" />}>
            <input
                className="list-title"
                value={listTitle}
                onChange={(event) => {
                    handleListTitleChange(event.currentTarget.value);
                }}
                placeholder={UNTITLED_PLACEHOLDER}
                autoFocus={listTitle?.trim() === ""}
            />
            <button
                onClick={() => {
                    navigate(ROUTES.home, {
                        state: { deleteListId: noteId },
                    });
                }}
            >
                <TrashIcon className="NoteHeader__icon" />
            </button>
        </PageHeader>
    );
}
