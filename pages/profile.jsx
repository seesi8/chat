import Image from 'next/image'
import { useContext, useEffect, useState } from 'react'
import { UserContext } from '../lib/context'
import styles from '../styles/profile.module.css'
import { getDoc, doc } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import { uuidv4 } from "@firebase/util"
import { auth } from '../lib/firebase'
import { removeFriend } from '../lib/hooks'
import Login from '../components/login'


function FriendCard(friend) {
  const { user, data } = useContext(UserContext)
  return (
    <main className={styles.FriendCardMain}>
      <div className={styles.friendProfileImageContainer}>
        <img className={styles.friendProfileImage} src={friend && friend.friend.profileIMG} />
      </div>
      <div className={styles.rightCollumn}>
        <h2 className={styles.freindDisplayName}>{friend.friend.displayName}</h2>
        <p className={styles.freindUsername}>@{friend.friend.username}</p>
      </div>
      <button onClick={() => removeFriend(friend.friend.id, user, data)} className={styles.removeFriend}>
        Remove Friend
      </button>
    </main>
  )
}

export default function Page({ }) {

  const incrimentValue = 3

  const { user, data } = useContext(UserContext)
  const [friends, setFriends] = useState([])
  const [currentFriends, setCurrentFriends] = useState(friends)
  const [friendsNumber, setFriendsNumber] = useState(incrimentValue)


  const getData = async () => {
    if (!data) {
      return
    }
    let localFriends = []
    for (let i = 0; i < data.friends.length; i++) {
      let friendsSnapshot = await getDoc(doc(firestore, "users", data.friends[i]))
      let friendDocSnapData = friendsSnapshot.data();
      friendDocSnapData.id = friendsSnapshot.id
      localFriends.push(friendDocSnapData)
    }
    setFriends(localFriends)
  }

  useEffect(() => {
    getData();
  }, [data])

  useEffect(() => {
    setCurrentFriends(friends.slice(0, friendsNumber))
  }, [friends, friendsNumber])

  if(!user){
    return(
      <Login/>
    )
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.profileImageContainerContainer}>
          <div className={styles.profileImageContainer}>
            <img className={styles.profileImage} src={data && data.profileIMG} />
          </div>
        </div>
        <h1 className={styles.displayName}>{data && data.displayName}</h1>
        <p className={styles.username}>@{data && data.username}</p>
        <hr />
        <h1 className={styles.friendsTitle}>Friends</h1>
        {
          currentFriends.map((item) => <div key={uuidv4()}><FriendCard friend={item} /></div>)
        }
        {friends.length > friendsNumber && <div className={styles.moreContainer}> <button onClick={() => (setFriendsNumber(friendsNumber + incrimentValue))} className={styles.more}>More...</button> </div>}
        <hr />
        <div className={styles.signOutButtonContainer}>
          <button onClick={() => auth.signOut()} className={styles.signOutButton}>Sign Out</button>
        </div>
      </div>
    </main>
  )
}

