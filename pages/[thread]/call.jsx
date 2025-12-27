import React, { useContext, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { acceptCallRequest, answerHandler, callHandler, createCallRequest, deleteCallRequest, getCameras, getThreadData, handleDisconnect, hangupHandler, sendMessageWithLock, sendTypeWithLock, webCamHandler } from '../../lib/functions';
import { PiPhoneTransferFill } from 'react-icons/pi';
import { useRouter } from 'next/router';
import { UserContext } from '../../lib/context';
import { useCollection, useDocument } from 'react-firebase-hooks/firestore';
import { collection, doc, orderBy, query, where } from "firebase/firestore"
import { firestore } from '../../lib/firebase';
import toast from 'react-hot-toast';

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
    const [selectedCamera, setSelectedCamera] = useState();
    const prevRequestRef = useRef();
    const [pcToken, setPcToken] = useState(0);
    const [connState, setConnState] = useState();

    const getRequest = () => {
        return request;
    }

    const resetPeer = () => {
        if (pcRef.current) pcRef.current.close();
        if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
        if (remoteStreamRef.current) remoteStreamRef.current.getTracks().forEach(t => t.stop());
        pcRef.current = null;
    };

    useEffect(() => {
        const pc = pcRef.current;
        if (!pc) return;
        const handler = () => setConnState(pc.connectionState);
        pc.addEventListener('connectionstatechange', handler);
        handler(); // set initial state
        return () => pc.removeEventListener('connectionstatechange', handler);
    }, [pcToken]);


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
        setRequestId(_requestId);
        if (threadId && _requestId && user && data) {
            await sendTypeWithLock(threadId, `${_requestId}`, user, data, 0x05)
        }
        return _requestId
    }

    const createPC = () => {
        const pc = new RTCPeerConnection(servers);
        pcRef.current = pc;
        setPcToken(t => t + 1); // trigger effect to rebind listeners
        return pc;
    };

    useEffect(() => {
        // const pc = new RTCPeerConnection(servers);

        // pcRef.current = pc;


        // pc.ontrack = (event) => {
        //     if (remoteVideoRef.current) {
        //         remoteVideoRef.current.srcObject = event.streams[0];
        //     }
        // };

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
        const prev = prevRequestRef.current;
        const wasActive = prev && prev.type === 1;
        const nowActive = request && request.type === 1;

        if (wasActive && !nowActive && !loading) {
            hangupHandler({ pcRef, localStreamRef, remoteStreamRef, webcamVideoRef, remoteVideoRef, unsubscribeRef, request });
            pcRef.current = null;
        }

        prevRequestRef.current = request;
    }, [request, loading]);

    const cameraCreation = async () => {
        const cameras = await getCameras()
        setCameras(cameras)
    }

    useEffect(() => {
        if (cameras[0]) {
            setSelectedCamera(cameras[0].deviceId)
        }
    }, [cameras])

    const answerCallRequestHandler = async () => {
        resetPeer();
        const pc = createPC();

        const { remoteStream, localStream } = await webCamHandler(
            pc,
            webcamVideoRef,
            remoteVideoRef,
            selectedCamera
        );
        remoteStreamRef.current = remoteStream;
        localStreamRef.current = localStream;
        unsubscribeRef.current = await answerHandler(pcRef.current, threadId, closeCallConnection, createCallHandler, answerCallRequestHandler, getRequest, submitCallRequest, user, data)
    }

    const closeCallConnection = () => {
        hangupHandler({ pcRef, localStreamRef, remoteStreamRef, webcamVideoRef, remoteVideoRef, unsubscribeRef, request })
        pcRef.current = null;
    }

    useEffect(() => {
        cameraCreation()
        // pcRef.current = new RTCPeerConnection(servers);
        return () => {
            hangupHandler({ pcRef, localStreamRef, remoteStreamRef, webcamVideoRef, remoteVideoRef, unsubscribeRef, request })
            pcRef.current = null;
        };
    }, []);

    const createCallHandler = async () => {
        console.log("CREATING")
        resetPeer();
        const pc = createPC();

        const { remoteStream, localStream } = await webCamHandler(
            pc,
            webcamVideoRef,
            remoteVideoRef,
            selectedCamera
        );

        remoteStreamRef.current = remoteStream;
        localStreamRef.current = localStream;
        unsubscribeRef.current = await callHandler(pcRef.current, threadId, closeCallConnection, createCallHandler, answerCallRequestHandler, getRequest, submitCallRequest, user, data)
    }

    useEffect(() => {
        console.log(connState)
        if (connState !== 'connected' && connState !== 'new' && connState !== 'connecting' && request?.type === 1) {
            console.log(connState)
            handleDisconnect(closeCallConnection, answerCallRequestHandler, createCallHandler, getRequest, submitCallRequest, user, data)
        }
    }, [connState, request]);

    useEffect(() => {
        if (request?.type === 1 && requestId) {
            // handleDisconnect(closeCallConnection, answerCallRequestHandler, createCallHandler, getRequest, submitCallRequest, user, data)
        }
    }, [requestId, request?.type]);

    useEffect(() => {
        if (remoteVideoRef.current.srcObject == null && request?.type == 1 && connState == 'connecting') {
            toast("Call Disconnected. Attemping to Reconnect.", {
                icon: '⚠️'
            })
            handleDisconnect(closeCallConnection, answerCallRequestHandler, createCallHandler, getRequest, submitCallRequest, user, data)
        }
    }, [remoteVideoRef.current, request])


    return (
        <>
            <div className="pt-14 text-white flex justify-center flex-wrap">
                <h1 className="font-bold text-3xl w-full text-center">Create Call With {threadData && threadData.groupName}</h1>
                {request == undefined ?
                    <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                        submitCallRequest()
                        await createCallHandler()
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
                        await answerCallRequestHandler()
                        acceptCallRequest(request.id)

                    }}>
                        Accept Call
                    </button> : ""
                }
                {request && request.type == 1 ?
                    <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                        closeCallConnection()
                        deleteCallRequest(request.id)
                    }}>
                        Close Call
                    </button> : ""
                }

                <label for="cameras" className='text-xl mr-5'>Choose a camera:</label>
                <select id="cameras" className='border bg-transparent rounded text-xl p-1' value={selectedCamera} onChange={(e) => setSelectedCamera(e.target.value)}>
                    {cameras.map((camera) => {
                        return (
                            <>

                                <option key={camera.deviceId} value={camera.deviceId} >{camera.label}</option>
                            </>
                        )
                    })}
                </select>
                <button
                    onClick={async () => {
                        console.log(remoteVideoRef.current.srcObject)
                        // handleDisconnect(closeCallConnection, answerCallRequestHandler, createCallHandler, getRequest, submitCallRequest, user, data)
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