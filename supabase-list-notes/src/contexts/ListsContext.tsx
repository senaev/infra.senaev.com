import { createContext, useContext } from "react";
import { Lists } from "../Lists/Lists";

type ListsContextType = Lists | undefined;

export const ListsContext = createContext<ListsContextType>(undefined);
ListsContext.displayName = "ListsContext";

export const useListsContext = () => {
    return useContext(ListsContext);
};
