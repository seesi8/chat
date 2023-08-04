import "../styles/globals.css";
import { Rubik } from "next/font/google";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "regenerator-runtime/runtime";
import { AnimatePresence } from "framer-motion";

config.autoAddCss = false;

const rubik = Rubik({
    weight: "400",
    subsets: ["latin"],
});

function MyApp({ Component, pageProps }) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            <div className={rubik.className}>
                <Component {...pageProps} />
            </div>
        </AnimatePresence>
    );
}

export default MyApp;
