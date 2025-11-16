import Link from "next/link";
import { useState } from "react";

export function Thread(thread) {
    const [threadData, setThreadData] = useState(thread.thread);

    return (
        <Link href={threadData.id ? threadData.id : "/"}>
            <button className="p-2 text-2xl text-white m-2 border-dotted border-l border-b rounded-bl-lg w-full text-left">
                <h1>
                    {threadData.groupName ? threadData.groupName : ""}
                </h1>
            </button>
        </Link>
    );
}