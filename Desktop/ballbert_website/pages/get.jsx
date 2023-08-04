import styles from "../styles/Get.module.css";
import Image from "next/image";
import BallbertInfo from "../components/QNA";
import Layout from "../components/layout";
import Header from "../components/header";

export default function Get({}) {
    return (
        <Layout>
            <main className="">
                <Header />
                <div className={styles.container}>
                    <h1 className={styles.getBallbert}>Get Ballbert</h1>
                    <div className={styles.get}>
                        <div className={styles.devkit}>
                            <h2 className={styles.backorder}>
                                Backorder Devkit
                            </h2>
                            <div className={styles.devkitImage}>
                                <Image
                                    src="/ballbertFront.png"
                                    alt="front image"
                                    fill="true"
                                />
                            </div>
                            <button className={styles.buyDevkit}>
                                Backorder Now
                            </button>
                            <p className={styles.devkitParagraph}>
                                The DevKit for Ballbert is a state-of-the-art
                                development kit that allows enthusiasts,
                                developers, and researchers to harness the
                                remarkable power of the revolutionary Ballbert
                                Voice Assistant. Backordering this DevKit means
                                that, due to high demand and limited initial
                                availability, customers can secure their units
                                in advance before they become readily available.
                                By placing a backorder, you demonstrate your
                                keen interest in exploring Ballbert's
                                cutting-edge capabilities, and you can look
                                forward to receiving your DevKit as soon as they
                                become restocked and shipped. This option
                                ensures that enthusiasts and developers can get
                                ahead in the queue, empowering them to delve
                                into the world of Ballbert and create innovative
                                applications and solutions that leverage its
                                skill ecosytem. Developers can get a DevKit to
                                help debelop skills for the Ballbert Voice
                                Assistant.
                            </p>
                        </div>
                        <div className={styles.ballbert}>
                            <h2 className={styles.preorder}>
                                Preorder Ballbert
                            </h2>
                            <div className={styles.ballbertImage}>
                                <Image
                                    src="/ballbert.svg"
                                    alt="front image"
                                    fill="true"
                                />
                            </div>
                            <button className={styles.buyBallbert}>
                                Preorder Now
                            </button>
                            <p className={styles.ballbertParagraph}>
                                Preordering Ballbert grants you the exclusive
                                opportunity to reserve your own voice assistant
                                before its official release. By placing a
                                preorder, you ensure that you'll be among the
                                first to receive Ballbert when it becomes
                                available. This early adoption gives you a head
                                start in exploring the cutting-edge voice
                                recognition and natural language processing
                                capabilities of this advanced AI-driven voice
                                assistant. Don't miss out on securing your place
                                at the forefront of voice technology - reserve
                                your Ballbert now and experience the future of
                                voice interactions.
                            </p>
                        </div>
                    </div>
                    <BallbertInfo />
                </div>
            </main>
        </Layout>
    );
}
