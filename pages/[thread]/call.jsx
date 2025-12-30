import React, { useContext, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { acceptCallRequest, answerHandler, callHandler, createCallRequest, deleteCallRequest, getCameras, getThreadData, handleDisconnect, hangupHandler, sendMessageWithLock, sendTypeWithLock, webCamHandler } from '../../lib/functions';
import { PiPhoneTransferFill } from 'react-icons/pi';
import { useRouter } from 'next/router';
import { UserContext } from '../../lib/context';
import { useCollection, useDocument } from 'react-firebase-hooks/firestore';
import { collection, doc, limitToLast, orderBy, query, where } from "firebase/firestore"
import { firestore } from '../../lib/firebase';
import toast from 'react-hot-toast';
import { CallHandler } from '../../lib/CallHandler';
import Spinner from '../../components/Spinner';

export default function CallPage() {
    const { user, data } = useContext(UserContext)
    const remoteVideoRef = useRef();
    const webcamVideoRef = useRef();
    const router = useRouter();
    const { thread: threadId } = router.query;
    const [threadData, setThreadData] = useState(null);
    const [cameras, setCameras] = useState([]);
    const [selectedCamera, setSelectedCamera] = useState();
    const [callHandler, setCallHandler] = useState()
    const [messages, setMessages] = useState();
    const [localShow, setLocalShow] = useState(false);
    const [remoteShow, setRemoteShow] = useState(false);

    const [messagesValue, messagesLoading, messagesError] = useCollection(
        query(
            collection(firestore, "threads", `${threadId}`, "messages"),
            orderBy("timeSent"),
            limitToLast(30)
        )
    );
    const [callState, setCallState] = useState(CallHandler.CALLSTATES.NO_STATE)
    const [localCallState, setLocalCallState] = useState(CallHandler.CALLSTATES.NO_STATE)

    useEffect(() => {
        getThreadData(threadId).then((data) => {
            setThreadData(data);
        });
    }, [threadId]);

    useEffect(() => {
        callHandler &&
            callHandler.decryptMessages(messagesValue).then(async (msgs) => {
                setMessages(msgs);
                setCallState(callHandler.getCallState())
                setLocalCallState(callHandler.getCallState())
            });
    }, [messagesValue, callHandler]);

    const cameraCreation = async () => {
        const cameras = await getCameras()
        setCameras(cameras)
    }

    useEffect(() => {
        if (cameras[0]) {
            setSelectedCamera(cameras[0].deviceId)
        }
    }, [cameras])

    useEffect(() => {
        cameraCreation()
    }, []);

    useEffect(() => {
        if (user && data && threadId) {
            setCallHandler(new CallHandler(user, data, threadId, onSteamChanges))
        }
    }, [user, data, threadId])

    const onSteamChanges = (localStream, remoteStream) => {
        if (webcamVideoRef.current) {
            setLocalShow(true)
            webcamVideoRef.current.srcObject = localStream;
        }
        if (remoteVideoRef.current) {
            setRemoteShow(true)
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }

    return (
        <>
            <div className="pt-14 text-white flex justify-center flex-wrap max-h-screen overflow-hidden">
                <h1 className="font-bold text-3xl w-full text-center">Create Call With {threadData && threadData.groupName}</h1>
                {callState == CallHandler.CALLSTATES.NO_STATE ?
                    <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                        callHandler.sendCallRequest()
                        setLocalCallState(CallHandler.CALLSTATES.CALL_REQUESTED)
                    }}>
                        Create Call
                    </button> : ""
                }
                {callState == CallHandler.CALLSTATES.CALL_REQUESTED ?
                    <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                        callHandler.cancelCallRequest()
                        setLocalCallState(CallHandler.CALLSTATES.NO_STATE)
                    }}>
                        Cancel Call Request
                    </button> : ""
                }
                {callState == CallHandler.CALLSTATES.INCOMING_CALL ?
                    <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                        
                        setLocalCallState(CallHandler.CALLSTATES.CALL_ACTIVE)
                        callHandler.acceptCallRequest()
                    }}>
                        Accept Call
                    </button> : ""
                }
                {callState == CallHandler.CALLSTATES.CALL_ACTIVE ?
                    <button type="button" className='text-xl w-full text-center justify-center flex border rounded m-4 p-1' onClick={async (e) => {
                        setLocalCallState(CallHandler.CALLSTATES.NO_STATE)
                        callHandler.closeCall()
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
                        
                        // handleDisconnect(closeCallConnection, answerCallRequestHandler, createCallHandler, getRequest, submitCallRequest, user, data)
                    }}
                    className="fixed right-5 bottom-5 h-20 w-20 bg-green-500 rounded font-bold text-black cursor-pointer"
                >
                    test
                </button>
                <div className="w-full m-4 relative h-fit max-h-[calc(100vh-15rem)] flex justify-start min-h-[20vh]">
                    {callState == CallHandler.CALLSTATES.CALL_ACTIVE &&
                        !localShow ?
                        <div className="w-1/6 rounded-lg absolute z-10 top-4 left-4 border-black border aspect-video z-20"><Spinner /></div> : <></>}
                    <video
                        className="w-1/6 rounded-lg absolute z-10 top-4 left-4 border-black border aspect-video"
                        ref={webcamVideoRef}
                        autoPlay
                        playsInline
                        hidden={callState != CallHandler.CALLSTATES.CALL_ACTIVE}
                    ></video>
                    {callState == CallHandler.CALLSTATES.CALL_ACTIVE &&
                        !remoteShow ?
                        <div className="rounded-lg h-[calc(100vh-15rem)] w-auto object-contain self-start aspect-video border-black border absolute left-0 top-0 z-20"><Spinner /></div> : <></>}
                    <video
                        className="rounded-lg h-[calc(100vh-15rem)] w-auto object-contain self-start aspect-video border-black border"
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        hidden={callState != CallHandler.CALLSTATES.CALL_ACTIVE}
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