import Image from "next/image";
import styles from "../styles/about.module.css";
import Layout from "../components/layout";
import Header from "../components/header";

export default function About({}) {
    return (
        <Layout>
            <Header />
            <main className={styles.contianer}>
                <h1 className={styles.about}>About Us</h1>
                <div className={styles.ballberts}>
                    <Image src="/ballberts.svg" fill />
                </div>
                <div className={styles.mainText}>
                    <p className={styles.firstParagraph}>
                        We believe in harnessing the power of cutting-edge
                        technology to create delightful and meaningful
                        experiences for users worldwide. Founded by Samuel
                        Liebert, an entrepreneur passionate about artificial
                        intelligence and human-computer interactions, Ballbert,
                        LLC has been at the forefront of developing advanced
                        AI-driven solutions that bring joy, convenience, and
                        efficiency into people's lives.
                    </p>

                    <h2>
                        Our flagship creation: Ballbert, the quirky and cheerful
                        voice assistant
                    </h2>
                    <p>
                        Named after its founder and creator, Ballbert is not
                        just an ordinary voice assistant; it's a loyal and
                        engaging robot companion designed to mimic human-like
                        interactions and provide useful assistance in a wide
                        range of tasks.
                    </p>

                    <p>
                        We take pride in Ballbert's ability to seamlessly
                        integrate into users' lives, offering practical
                        solutions to everyday challenges. Whether it's setting
                        reminders, scheduling events, answering questions, or
                        even sharing a good laugh with its witty jokes, Ballbert
                        is here to make life easier and more enjoyable.
                    </p>

                    <h2>Empowering users through custom skills</h2>
                    <p>
                        At Ballbert, LLC, we believe in empowering our users to
                        extend Ballbert's functionality to suit their unique
                        needs. Our robust skill ecosystem allows developers and
                        enthusiasts to create custom skills, enabling Ballbert
                        to communicate with other smart devices and services
                        within homes. From controlling smart home appliances to
                        interacting with third-party applications, Ballbert's
                        versatility knows no bounds.
                    </p>

                    <h2>Privacy and security</h2>
                    <p>
                        Privacy and security are paramount at Ballbert, LLC. We
                        adhere to stringent data protection measures, ensuring
                        that user interactions and personal information are
                        handled with utmost care and confidentiality. Trust is
                        the foundation of our relationship with users, and we
                        take every step to maintain that trust.
                    </p>

                    <h2>Constant improvement and innovation</h2>
                    <p>
                        As we continue to explore new frontiers in AI
                        technology, Ballbert, LLC remains committed to constant
                        improvement and innovation. We strive to make Ballbert
                        smarter, more intuitive, and responsive to users' needs
                        with regular updates and enhancements.
                    </p>

                    <h2>Join us on this exciting journey</h2>
                    <p>
                        Join us on this exciting journey, as we create a world
                        where technology brings joy and human-like
                        companionship. With Ballbert, LLC, the future is
                        delightful, and the possibilities are endless. Together,
                        let's embrace the wonders of AI and make every day a
                        little brighter and more fulfilling.
                    </p>
                </div>
            </main>
        </Layout>
    );
}
