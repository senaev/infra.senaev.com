import {
    SENAEV_CURRENT_DUTY,
    SENAEV_CV_LINK,
    SENAEV_ELEVATOR_PITCH,
    SENAEV_FULL_NAME,
    SENAEV_LOCATION,
    SENEAV_CONTACTS,
} from 'const/const';
import { NON_BREAKING_SPACE } from 'const/NON_BREAKING_SPACE';
import Image from 'next/image';
import Link from 'next/link';
import type { JSX } from 'react';

import './index.css';

import styles from './index.module.css';

const AVATAR_SIZE = 150;

export default function Page(): JSX.Element {
    return <div className={styles.MainPage__container}>
        <div className={styles.MainPage__container_center}>
            <div className={styles.MainPage__photoAndTitle}>
                <div className={styles.MainPage__avatarContainer}>
                    <Image
                        width={AVATAR_SIZE}
                        height={AVATAR_SIZE}
                        src={'/img/avatar-head.webp'}
                        alt={'Profile Picture'}
                    />
                </div>
                <div className={styles.MainPage__title}>
                    <h1>
                        {SENAEV_FULL_NAME}
                    </h1>
                    <p>
                        {SENAEV_CURRENT_DUTY}
                    </p>
                </div>
            </div>
            <div>
                <h2>
                    {'About Me'}
                </h2>
                {
                    SENAEV_ELEVATOR_PITCH.map((info, i) => <p key={i}>
                        {info}
                    </p>)
                }
            </div>
            <div className={styles.MainPage__contactsAndCv}>
                <div>
                    <h2>
                        {'Contacts'}
                    </h2>
                    {
                        SENEAV_CONTACTS.map(({
                            header,
                            title,
                            link,
                        }, i) => <div
                            key={i}
                        >
                            {`${header}:`}
                            {NON_BREAKING_SPACE}
                            {
                                link
                                    ? <a
                                        href={link}
                                        target={'_blank'}
                                        rel={'noreferrer'}
                                    >
                                        {title}
                                    </a>
                                    : title
                            }
                        </div>)
                    }
                </div>
                <div className={styles.MainPage__resumeContainer}>
                    <h2>
                        {'Details'}
                    </h2>
                    <div>
                        {`Location:${NON_BREAKING_SPACE}${SENAEV_LOCATION}`}
                    </div>
                    <div>
                        {`CV:${NON_BREAKING_SPACE}`}
                        <Link href={SENAEV_CV_LINK}>
                            {'senaev.com/cv'}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    </div>;
}
