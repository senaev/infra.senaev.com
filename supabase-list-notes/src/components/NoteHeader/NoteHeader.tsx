import { ArrowLeftIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../const/ROUTES";
import { UNTITLED_PLACEHOLDER } from "../../const/UNTITLED_PLACEHOLDER";
import { useNotesListContext } from "../../contexts/NotesListContext";
import { PageHeader } from "../PageHeader/PageHeader";
import "./NoteHeader.css";

export function NoteHeader({ noteId, jumpToEdit }: { noteId: number; jumpToEdit: VoidFunction }) {
    const navigate = useNavigate();

    const notes = useNotesListContext();

    function handleListTitleChange(title: string) {
        notes.changeTitleLocally(noteId, title);
        notes.persistTitle(noteId, title);
    }

    const noteItem = notes.items?.find((list) => list.id === noteId);
    return (
        <PageHeader homeButtonIcon={<ArrowLeftIcon className="NoteHeader__icon" />}>
            {noteItem ? (
                <input
                    className="list-title"
                    value={noteItem.title}
                    onChange={(event) => {
                        handleListTitleChange(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();

                            jumpToEdit();
                        }
                    }}
                    placeholder={UNTITLED_PLACEHOLDER}
                    autoFocus={!noteItem.title.trim()}
                />
            ) : null}
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
