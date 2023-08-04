import styles from "../styles/Contact.module.css";
import ContactTile from "../components/ContactTile";
import { faPhone, faEnvelope } from "@fortawesome/free-solid-svg-icons";
import Header from "../components/header";
import Layout from "../components/layout";

const contacts = [
    { icon: faPhone, back: "+1 773-766-9065", front: "Call Us", type: "phone" },
    {
        icon: faEnvelope,
        back: "sbliebert@ballbert.com",
        front: "Email Us",
        type: "email",
    },
];

export default function Contact({}) {
    return (
        <Layout>
            <main>
                <Header />
                <div className={styles.container}>
                    <div className={styles.contacts}>
                        {contacts.map((contact, index) => (
                            <ContactTile
                                key={index}
                                icon={contact.icon}
                                front={contact.front}
                                back={contact.back}
                                type={contact.type}
                            />
                        ))}
                    </div>
                </div>
            </main>
        </Layout>
    );
}
