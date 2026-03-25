import "./App.css";

import { useEffect, useState } from "react";
import { supabase } from "./utils/supabase";

export default function App() {
    const [todos, setTodos] = useState<any[]>([]);

    useEffect(() => {
        async function getTodos() {
            const result = await supabase.from("grocery_items").select();

            console.log(result);

            if (result.data) {
                setTodos(result.data);
            }
        }

        getTodos();
    }, []);

    return (
        <div className="App">
            <header className="App-header"></header>
            <main>
                <ul>
                    {todos.map((todo) => (
                        <li key={todo.id}>{todo.name}</li>
                    ))}
                </ul>
            </main>
        </div>
    );
}
