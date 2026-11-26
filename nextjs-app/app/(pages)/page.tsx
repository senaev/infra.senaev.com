import classNames from 'classnames';
import {
    SENAEV_CURRENT_DUTY,
    SENAEV_CV_LINK,
    SENAEV_ELEVATOR_PITCH,
    SENAEV_EMAIL_LINK,
    SENAEV_FULL_NAME,
    SENAEV_GITHUB_LINK,
    SENAEV_LINKEDIN_LINK,
    SENAEV_LOCATION,
    SENAEV_SOCIALS,
    SENAEV_TELEGRAM_LINK,
} from 'const/const';
import Image from 'next/image';
import Link from 'next/link';
import type { JSX } from 'react';

import './index.css';

import styles from './index.module.css';

const AVATAR_SIZE = 150;

/** External profiles shown as buttons after the CV; the CV button comes first. */
const PROFILE_BUTTONS = [
    {
        name: 'LinkedIn',
        link: SENAEV_LINKEDIN_LINK,
    },
    {
        name: 'GitHub',
        link: SENAEV_GITHUB_LINK,
    },
    {
        name: 'Email',
        link: SENAEV_EMAIL_LINK,
    },
    {
        name: 'Telegram',
        link: SENAEV_TELEGRAM_LINK,
    },
];

/** The other public links, in one quiet line; LinkedIn and GitHub are already buttons. */
const MORE_LINKS = SENAEV_SOCIALS.filter(({ link }) => link !== SENAEV_LINKEDIN_LINK && link !== SENAEV_GITHUB_LINK);

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

            <nav className={styles.MainPage__buttons}>
                <Link
                    href={SENAEV_CV_LINK}
                    className={classNames(styles.MainPage__button, styles.MainPage__button_primary)}
                >
                    {'CV'}
                </Link>
                {
                    PROFILE_BUTTONS.map(({ name, link }) => <a
                        key={name}
                        href={link}
                        target={'_blank'}
                        rel={'noreferrer'}
                        className={styles.MainPage__button}
                    >
                        {name}
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

            <footer className={styles.MainPage__more}>
                {'More: '}
                {
                    MORE_LINKS.map(({ name, link }, i) => <span key={link}>
                        {i > 0 ? ' · ' : null}
                        <a
                            href={link}
                            target={link.startsWith('/') ? undefined : '_blank'}
                            rel={'noreferrer'}
                        >
                            {name}
                        </a>
                    </span>)
                }
            </footer>
        </main>
    </div>;
}
