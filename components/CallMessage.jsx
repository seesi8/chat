import { useEffect, useState } from "react";
import Image from "next/image";
import { base64ToBlob } from "../lib/e2ee/e2ee";
import { FaFile } from "react-icons/fa";
import { FaCloudDownloadAlt } from "react-icons/fa";
import { useCollection, useDocument } from "react-firebase-hooks/firestore";
import { collection, doc, orderBy, query, where } from "firebase/firestore"
import { firestore } from "../lib/firebase";
import { deleteCallRequest, fillRequestData } from "../lib/functions";
import { useRouter } from "next/router";

export function CallMessage({ message, threadId }) {
    const requestID = message.messages[0]
    if (!message.messages[0]) {
        return;
    }

    const [request, setRequest] = useState()
    const router = useRouter();

    const callRequestsQuery = threadId
        ? query(
            collection(firestore, "callRequests"),
            where("threadId", "==", threadId),
            orderBy("timeCreated", "asc")
        )
        : null;

    const requestReferance =
        doc(
            firestore, "callRequests",
            requestID
        );
    const [callRequestsSnapshot, callRequestsLoading, callRequestsError] = useCollection(
        callRequestsQuery,
        {
            snapshotListenOptions: { includeMetadataChanges: true },
        }
    );
    const [requestSnapshot, requestLoading, requestError] = useDocument(
        requestReferance,
        {
            snapshotListenOptions: { includeMetadataChanges: true },
        }
    );

    useEffect(() => {
        // console.log(request)
    }, [request])

    useEffect(() => {
        console.log(requestID)
        if (!requestSnapshot) {
            setRequest(undefined)
            return;
        }
        const exists = requestSnapshot.exists()
        if (!exists) {
            setRequest(undefined)
            return;
        }
        const id = requestSnapshot.id;
        let requestData = requestSnapshot.data()
        requestData.id = id;
        fillRequestData(requestData).then(() => {
            setRequest(requestData)
        });
    }, [requestSnapshot])




    useEffect(() => {
        if (callRequestsSnapshot == undefined) {
            // setRequest(undefined)
            return
        }
        if (callRequestsSnapshot.docs == undefined) {
            // setRequest(undefined)
            return
        }
        if (callRequestsSnapshot.docs.length > 1) {
            for (let i = 0; i < callRequestsSnapshot.docs.length - 1; i++) {
                const currentDoc = callRequestsSnapshot.docs[i]
                deleteCallRequest(currentDoc.id)
            }
        }
        let correctDoc = callRequestsSnapshot.docs[callRequestsSnapshot.docs.length - 1]
        // if (correctDoc) {
        //     let id = correctDoc.id
        //     correctDoc = correctDoc.data()
        //     correctDoc.id = id
        //     setRequest(correctDoc)
        // } else {
        //     setRequest(undefined)
        // }
    }, [callRequestsSnapshot])

    if(!request){
        return;
    }
    return (
        <div className="flex w-full justify-center flex-wrap">

            <h3 className="flex w-full justify-center text-xs text-gray-500">
                {`${request && request.from.username} created a call`}
            </h3>

            {request != undefined ?
                <div className="text-white">
                    <button className="border border-neutral-400 px-6 rounded text-white font-bold my-2 mx-2 py-1" onClick={() => {
                        router.push(`${router.asPath}/call`)
                    }}>
                        Accept
                    </button>
                    <button className="border border-neutral-400 px-6 rounded text-white font-bold my-2 mx-2 py-1" onClick={() => {
                        deleteCallRequest(requestID)
                    }}>
                        Decline
                    </button>
                </div>
                : <></>}
        </div>
    )
}
