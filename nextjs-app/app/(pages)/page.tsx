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
import { NON_BREAKING_SPACE } from 'const/NON_BREAKING_SPACE';
import Image from 'next/image';
import Link from 'next/link';
import type { JSX } from 'react';

import './index.css';

import styles from './index.module.css';

const AVATAR_SIZE = 150;

/** Shown under the location as "Label: address", with the address as the link text, so it can be copied. */
const HEADER_LINKS = [
    {
        label: 'Resume',
        text: `senaev.com${SENAEV_CV_LINK}`,
        link: SENAEV_CV_LINK,
    },
    {
        label: 'LinkedIn',
        text: 'linkedin.com/in/senaev',
        link: SENAEV_LINKEDIN_LINK,
    },
    {
        label: 'GitHub',
        text: 'github.com/senaev',
        link: SENAEV_GITHUB_LINK,
    },
    {
        label: 'Email',
        text: SENAEV_EMAIL,
        link: SENAEV_EMAIL_LINK,
    },
    {
        label: 'Telegram',
        text: `@${SENAEV_TELEGRAM_NICKNAME}`,
        link: SENAEV_TELEGRAM_LINK,
    },
];

export default function Page(): JSX.Element {
    return <div className={styles.MainPage__container}>
        <main className={styles.MainPage__column}>
            <header className={styles.MainPage__header}>
                <div className={styles.MainPage__identity}>
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
                </div>

                <nav className={styles.MainPage__links}>
                    {
                        HEADER_LINKS.map(({
                            label, text, link,
                        }) => <span key={link}>
                            {`${label}:`}
                            {NON_BREAKING_SPACE}
                            {
                                link.startsWith('/')
                                    ? <Link href={link}>
                                        {text}
                                    </Link>
                                    : <a
                                        href={link}
                                        target={'_blank'}
                                        rel={'noreferrer'}
                                    >
                                        {text}
                                    </a>
                            }
                        </span>)
                    }
                </nav>
            </header>

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
