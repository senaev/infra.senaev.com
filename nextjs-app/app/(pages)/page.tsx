import {
    SENAEV_CURRENT_DUTY,
    SENAEV_CV_LINK,
    SENAEV_ELEVATOR_PITCH,
    SENAEV_EMAIL,
    SENAEV_EMAIL_LINK,
    SENAEV_FULL_NAME,
    SENAEV_GITHUB_LINK,
    SENAEV_LINKEDIN_LINK,
    SENAEV_LOCATION,
    SENAEV_TELEGRAM_LINK,
    SENAEV_TELEGRAM_NICKNAME,
} from 'const/const';
import Image from 'next/image';
import Link from 'next/link';
import type { JSX } from 'react';

import './index.css';

import styles from './index.module.css';

const AVATAR_SIZE = 150;

/** Shown under the location as plain links, with the address itself as the text, so it can be copied. */
const HEADER_LINKS = [
    {
        text: `senaev.com${SENAEV_CV_LINK}`,
        link: SENAEV_CV_LINK,
    },
    {
        text: 'linkedin.com/in/senaev',
        link: SENAEV_LINKEDIN_LINK,
    },
    {
        text: 'github.com/senaev',
        link: SENAEV_GITHUB_LINK,
    },
    {
        text: SENAEV_EMAIL,
        link: SENAEV_EMAIL_LINK,
    },
    {
        text: `@${SENAEV_TELEGRAM_NICKNAME}`,
        link: SENAEV_TELEGRAM_LINK,
    },
];

export default function Page(): JSX.Element {
    return <div className={styles.MainPage__container}>
        <main className={styles.MainPage__column}>
            <header className={styles.MainPage__header}>
                <Image
                    className={styles.MainPage__avatar}
                    width={AVATAR_SIZE}
                    height={AVATAR_SIZE}
                    src={'/img/avatar-head.webp'}
                    alt={'Profile Picture'}
                />
                <h1>
                    {SENAEV_FULL_NAME}
                </h1>
                <p className={styles.MainPage__duty}>
                    {SENAEV_CURRENT_DUTY}
                </p>
                <p className={styles.MainPage__location}>
                    {SENAEV_LOCATION}
                </p>
            </header>

            <nav className={styles.MainPage__links}>
                {
                    HEADER_LINKS.map(({ text, link }) => link.startsWith('/')
                        ? <Link
                            key={link}
                            href={link}
                        >
                            {text}
                        </Link>
                        : <a
                            key={link}
                            href={link}
                            target={'_blank'}
                            rel={'noreferrer'}
                        >
                            {text}
                        </a>)
                }
            </nav>

            <section className={styles.MainPage__about}>
                <h2>
                    {'About Me'}
                </h2>
                {
                    SENAEV_ELEVATOR_PITCH.map((info, i) => <p key={i}>
                        {info}
                    </p>)
                }
            </section>

        </main>
    </div>;
}
