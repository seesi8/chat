import React, { useContext, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { acceptCallRequest, answerHandler, callHandler, createCallRequest, deleteCallRequest, getCameras, getThreadData, hangupHandler, webCamHandler } from '../../lib/functions';
import { PiPhoneTransferFill } from 'react-icons/pi';
import { useRouter } from 'next/router';
import { UserContext } from '../../lib/context';
import { useCollection, useDocument } from 'react-firebase-hooks/firestore';
import { collection, doc, orderBy, query, where } from "firebase/firestore"
import { firestore } from '../../lib/firebase';

export default function CallPage() {
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const { user, data } = useContext(UserContext)
    const remoteVideoRef = useRef();
    var options = { mimeType: 'video/webm; codecs=vp9' };
    let mediaRecorder = null;
    const unsubscribeRef = useRef();
    const webcamVideoRef = useRef();
    const router = useRouter();
    const { thread: threadId } = router.query;
    const [requestId, setRequestId] = useState()
    const [threadData, setThreadData] = useState(null);
    const [request, setRequest] = useState();
    const [cameras, setCameras] = useState([]);

    const callRequestsQuery = threadId
        ? query(
            collection(firestore, "callRequests"),
            where("threadId", "==", threadId),
            orderBy("timeCreated", "asc")
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
        if (snapshot == undefined) {
            setRequest(undefined)
            return
        }
        if (snapshot.docs == undefined) {
            setRequest(undefined)
            return
        }
        if (snapshot.docs.length > 1) {
            for (let i = 0; i < snapshot.docs.length - 1; i++) {
                const currentDoc = snapshot.docs[i]
                deleteCallRequest(currentDoc.id)
            }
        }
        let correctDoc = snapshot.docs[snapshot.docs.length - 1]
        if (correctDoc) {
            let id = correctDoc.id
            correctDoc = correctDoc.data()
            correctDoc.id = id
            setRequest(correctDoc)
        } else {
            setRequest(undefined)
        }
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

    const createPC = () => {
        const pc = new RTCPeerConnection(servers);

        pc.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        pcRef.current = pc;
        return pc;
    };


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
        if (request == undefined) {
            hangupHandler({ pcRef, localStreamRef, remoteStreamRef, webcamVideoRef, remoteVideoRef, unsubscribeRef, request })
            console.log(remoteVideoRef.current.srcObject)
            pcRef.current = null;
        }
    }, [request])



    useEffect(() => {
        pcRef.current = new RTCPeerConnection(servers);
        return () => {
            hangupHandler({ pcRef, localStreamRef, remoteStreamRef, webcamVideoRef, remoteVideoRef, unsubscribeRef, request })
            pcRef.current = null;
        };
    }, []);
    return (
        <>
            <div className="pt-14 text-white flex justify-center flex-wrap">
                <h1 className="font-bold text-3xl w-full text-center">Create Call With {threadData && threadData.groupName}</h1>
                {request == undefined ?
                    <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                        submitCallRequest()
                        const pc = createPC();

                        const { remoteStream, localStream } = await webCamHandler(
                            pc,
                            webcamVideoRef,
                            remoteVideoRef
                        );

                        remoteStreamRef.current = remoteStream;
                        localStreamRef.current = localStream;
                        unsubscribeRef.current = await callHandler(pcRef.current, threadId)
                    }}>
                        Create Call
                    </button> : ""
                }
                {request != undefined && request.from == user.uid && request.type != 1 ?
                    <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                        deleteCallRequest(request.id)
                    }}>
                        Cancel Call
                    </button> : ""
                }
                {request != undefined && request.from != user.uid && request.type != 1 ?
                    <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                        const pc = createPC();

                        const { remoteStream, localStream } = await webCamHandler(
                            pc,
                            webcamVideoRef,
                            remoteVideoRef
                        );
                        remoteStreamRef.current = remoteStream;
                        localStreamRef.current = localStream;
                        unsubscribeRef.current = await answerHandler(pcRef.current, threadId)
                        acceptCallRequest(request.id)

                    }}>
                        Accept Call
                    </button> : ""
                }
                {request && request.type == 1 ?
                    <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                        hangupHandler({ pcRef, localStreamRef, remoteStreamRef, webcamVideoRef, remoteVideoRef, unsubscribeRef, request })
                        pcRef.current = null;
                        deleteCallRequest(request.id)
                    }}>
                        Close Call
                    </button> : ""
                }

                <label for="cameras" className='text-xl mr-5'>Choose a camera:</label>
                <select id="cameras" className='border bg-transparent rounded text-xl p-1'>
                    {cameras.map((camera) => {
                        console.log(camera)
                        return (
                            <>

                                <option value={camera.label} >{camera.label}</option>
                            </>
                        )
                    })}
                </select>
                <button
                    onClick={async () => {
                        const cameras = await getCameras()
                        setCameras(cameras)
                    }}
                    className="fixed right-5 bottom-5 h-20 w-20 bg-green-500 rounded font-bold text-black cursor-pointer"
                >
                    test
                </button>
                <div className="w-full m-4 relative">
                    <video
                        className="w-1/4 rounded-lg absolute z-10 top-4 left-4 border-black border"
                        ref={webcamVideoRef}
                        autoPlay
                        muted
                        playsInline
                        hidden={request ? request.type == 1 ? false : request.from == user.uid ? false : true : true}
                    ></video>

                    <video
                        className="webcamVideo absolute rounded-lg w-full"
                        ref={remoteVideoRef}
                        autoPlay
                        muted
                        playsInline
                        hidden={request ? request.type == 1 ? false : true : true}
                    ></video>
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