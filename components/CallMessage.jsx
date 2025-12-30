import { useRouter } from "next/router";
import { CallHandler } from "../lib/CallHandler";
import { UserContext } from "../lib/context";
import { useContext } from "react";
export function CallMessage({ message, messageHandler }) {

    const router = useRouter();
    const {user, data} = useContext(UserContext)

    if (message.type == CallHandler.MESSAGETYPES.CALL_REQUEST) {
        return (
            <div className="flex w-full justify-center flex-wrap">

                <h3 className="flex w-full justify-center text-xs text-gray-500">
                    {`${message && message.sentBy.username} created a call`}
                </h3>

                {message.callOpen && message.sentBy.user != user.uid ?
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
    else if (message.type == CallHandler.MESSAGETYPES.ACCEPT_CALL_REQUEST) {
        return (
            <div className="flex w-full justify-center flex-wrap">
                <h3 className="flex w-full justify-center text-xs text-gray-500">
                    {`${message && message.sentBy.username} joined a call`}
                </h3>
            </div>
        )
    }
    else if (message.type == CallHandler.MESSAGETYPES.CANCEL_CALL_REQUEST) {
        return (
            <div className="flex w-full justify-center flex-wrap">
                <h3 className="flex w-full justify-center text-xs text-gray-500">
                    {`${message && message.sentBy.username} hung up the call`}
                </h3>
            </div>
        )
    }

}
