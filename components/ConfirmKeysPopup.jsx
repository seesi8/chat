import { useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "../lib/context";
import Popup from "./popup";
import { sixNums } from "../lib/e2ee/e2ee";
import { removeFriend, removeRequest, submitUsername } from "../lib/functions";

export default function ConfirmKeyPopup({ setPopup, other_data, accepting }) {
    const { user, data } = useContext(UserContext);
    const [currentInput, setCurrentInput] = useState("");
    const [numbers, setNumbers] = useState([])
    const [checked, setChecked] = useState(false)
    useEffect(() => {
        if (user.uid > other_data.id) {
            sixNums(`${data.publicKey}${other_data.publicKey}`).then((nums) => {
                
                setNumbers(nums)
            })
        }
        else {
            sixNums(`${other_data.publicKey}${data.publicKey}`).then((nums) => {
                

                setNumbers(nums)
            })
        }
    }, [])

    useEffect(() => {
        
    }, [checked])


    return (
        <Popup title={`Please confirm the numbers match with ${other_data.username}`} setPopup={setPopup} onExit={() => {accepting ? removeFriend(other_data.id, user, data) : removeRequest(other_data.id, user, data)}}>
            <div className="grid grid-cols-3 w-full text-center">
                {
                    numbers.map((number, i) => {
                        return <p className="text-9xl" key={i}>{number}</p>
                    })
                }
            </div>
            <form className="flex flex-wrap items-center justify-center" onSubmit={(e) => {e.preventDefault()}}>
                <input type="checkbox" name="checkbox" id="checkbox" className="peer sr-only" onClick={(e) => { setChecked(e.target.checked) }} checked={checked}/>
                <label htmlFor="checkbox" className="text-lg w-10 h-10 rounded border inline-block flex justify-center items-center">{
                    checked ? <div className="w-8 h-8 bg-white rounded"></div> : <></>}</label>
                <label htmlFor="checkbox" className="text-lg pl-2">I confirm they are the same numbers</label>
                <button
                    onClick={() => {setPopup(false)}}
                    className="border border-neutral-400 px-6 rounded text-white font-bold h-10 mt-5 w-full disabled:border-neutral-600 disabled:text-neutral-600"
                    data-testid="lost-key-restore"
                    disabled={!checked}
                    type="button"
                >
                    <h1>Continue</h1>

                </button>
            </form>
        </Popup>
    );
}
