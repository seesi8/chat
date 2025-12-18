import React, { useContext, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { answerHandler, callHandler, createCallRequest, deleteCallRequest, getThreadData, webCamHandler } from '../../lib/functions';
import { PiPhoneTransferFill } from 'react-icons/pi';
import { useRouter } from 'next/router';
import { UserContext } from '../../lib/context';
import { useCollection, useDocument } from 'react-firebase-hooks/firestore';
import { collection, doc, query, where } from "firebase/firestore"
import { firestore } from '../../lib/firebase';

export default function CallPage() {
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const { user, data } = useContext(UserContext)
    const remoteVideoRef = useRef();
    var options = { mimeType: 'video/webm; codecs=vp9' };
    let mediaRecorder = null;
    const webcamButtonRef = useRef();
    const webcamVideoRef = useRef();
    const router = useRouter();
    const { thread: threadId } = router.query;
    const [requestId, setRequestId] = useState()
    const [threadData, setThreadData] = useState(null);

    const callRequestsQuery = threadId
        ? query(
            collection(firestore, "callRequests"),
            where("threadId", "==", threadId)
        )
        : null;
    const [snapshot, loading, error] = useCollection(
        callRequestsQuery,
        {
            snapshotListenOptions: { includeMetadataChanges: true },
        }
    );

    useEffect(() => {
        getThreadData(threadId).then((data) => {
            setThreadData(data);
        });
    }, [threadId]);

    useEffect(() => {
        console.log(snapshot)
    }, [snapshot])

    const servers = {
        iceServers: [
            {
                urls: [
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',
                ],
            },
        ],
        iceCandidatePoolSize: 10,
    };
    const pcRef = useRef(null);

    const submitCallRequest = async () => {
        const _requestId = await createCallRequest(threadId, user, data)
        console.log(_requestId)
        setRequestId(_requestId);
    }

    useEffect(() => {
        const pc = new RTCPeerConnection(servers);
        pcRef.current = pc;


        pc.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        return () => {

            pcRef.current?.close();
            pcRef.current = null;

        };
    }, []);

    useEffect(() => {
        return () => {
            if (requestId) {
                console.log("deleteing", requestId)
                deleteCallRequest(requestId);
            }
        }
    }, [requestId])


    useEffect(() => {
        pcRef.current = new RTCPeerConnection(servers);
        return () => pcRef.current?.close();
    }, []);
    return (
        <>
            <div className="pt-14 text-white flex justify-center flex-wrap">
                <h1 className="font-bold text-3xl w-full text-center">Create Call With {threadData && threadData.groupName}</h1>
                <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                    submitCallRequest()

                    // remoteStreamRef.current = await webCamHandler(pcRef.current, threadId, webcamVideoRef, localStreamRef.current, options, mediaRecorder, remoteVideoRef)
                    // callHandler(pcRef.current, threadId)
                }}>
                    Create Call
                </button>
                <button
                    onClick={async () => {
                        if (true) {
                            submitCallRequest()
                            // remoteStreamRef.current = await webCamHandler(pcRef.current, threadId, webcamVideoRef, localStreamRef.current, options, mediaRecorder, remoteVideoRef)
                            // answerHandler(pcRef.current, threadId)
                        }
                        else {
                        }
                    }}
                    className="fixed right-5 bottom-5 h-20 w-20 bg-green-500 rounded font-bold text-black cursor-pointer"
                >
                    test
                </button>
                <div className="w-full m-4">
                    <span>
                        <h1 id="subtitle">
                            <span> Local Stream</span>
                        </h1>
                        <video
                            className="webcamVideo"
                            ref={webcamVideoRef}
                            autoPlay
                            muted
                            playsInline
                        ></video>
                    </span>
                    <span>
                        <h1 id="subtitle">
                            <span> Remote Stream</span>
                        </h1>
                        <video
                            className="webcamVideo"
                            ref={remoteVideoRef}
                            autoPlay
                            muted
                            playsInline
                        ></video>
                    </span>
                </div>
            </div >

        </>
    );
}

/*
Optional data fetching examples:

// Server-side rendering
export async function getServerSideProps(context) {
    // fetch data here
    return { props: {} };
}

// Static generation
export async function getStaticProps() {
    // fetch data here
    return { props: {} };
}
*/