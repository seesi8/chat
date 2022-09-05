import { getFirestore, doc } from 'firebase/firestore';
import { useDocument } from 'react-firebase-hooks/firestore';
import { firestore } from '../lib/firebase';

export default function Page({ }) {
  const [value, loading, error] = useDocument(
    doc(firestore, 'threads', '5f4b390e-0808-4477-9897-7cf0bc7d115a'),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  );
  return (
    <div>
      <p>
        {console.log("reloaded")}
        {error && <strong>Error: {JSON.stringify(error)}</strong>}
        {loading && <span>Document: Loading...</span>}
        {value && <span>Document: {JSON.stringify(value.data())}</span>}
      </p>
    </div>
  );
};