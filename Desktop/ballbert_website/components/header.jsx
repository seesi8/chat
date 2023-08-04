import styles from "../styles/Header.module.css";
import Link from "next/link";
import Image from "next/image";
export default function Header({}) {
    return (
        <header className={styles.header}>
            <div className={styles.items}>
                <Link href="/">
                    <div className={styles.ballbert}>
                        <Image src="./ballbert.svg" fill />
                    </div>
                </Link>
                <Link href="/get">Get One Now</Link>
                <Link href="/docs">Docs</Link>
                <Link href="/about">About</Link>
                <Link href="/contact">Contact</Link>
            </div>
            <hr className={styles.break} />
        </header>
    );
}
