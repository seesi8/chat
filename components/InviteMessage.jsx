import { useRouter } from "next/router";
import { CallHandler } from "../lib/CallHandler";
import { UserContext } from "../lib/context";
import { useContext } from "react";
export function InviteMessage({ message, messageHandler }) {

    const router = useRouter();
    const { user, data } = useContext(UserContext)

    console.log(message)
    return (
        <div className="flex w-full justify-center flex-wrap">

            <h3 className="flex w-full justify-center text-xs text-gray-500">
                {`${message && message.sentBy.username} created a invite`}
            </h3>
            
            {message.sentBy.id != user.uid ?
                <div className="text-white">
                    <button className="border border-neutral-400 px-6 rounded text-white font-bold my-2 mx-2 py-1" onClick={() => {
                        router.push(`${router.asPath}/call`)
                    }}>
                        Accept
                    </button>
                    <button className="border border-neutral-400 px-6 rounded text-white font-bold my-2 mx-2 py-1" onClick={async () => {
                        await messageHandler.sendTypeWithLock(`${message.id}`, CallHandler.MESSAGETYPES.CANCEL_CALL_REQUEST)
                    }}>
                        Decline
                    </button>
                </div>
                : <></>}

        </div>
    )


}
