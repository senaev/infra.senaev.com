import { resolve } from 'path';

import classNames from 'classnames';
import { MarkdownHeader } from 'components/MarkdownHeader';
import { PrintButton } from 'components/PrintButton/PrintButton';
import {
    SENAEV_CURRENT_DUTY_SHORT,
    SENAEV_EDUCATIONS,
    SENAEV_ELEVATOR_PITCH,
    SENAEV_LANGUAGE_LEVELS,
    SENAEV_LOCATION,
    SENAEV_SKILLS,
    SENAEV_FULL_NAME,
    SENEAV_CONTACTS,
} from 'const/const';
import { FONT_MERRIWEATHER_CLASSNAMES } from 'const/FONT_MERRIWEATHER_CLASSNAMES/FONT_MERRIWEATHER_CLASSNAMES';
import { NON_BREAKING_SPACE } from 'const/NON_BREAKING_SPACE';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { JSX } from 'react';
import { getNextJsRootDirectory } from 'utils/getNextJsRootDirectory';
import { getNoteByFilePath } from 'utils/Notes/getNoteByFilePath';
import { renderNoteByMarkdownContent } from 'utils/Notes/renderNoteByMarkdownContent';
import { getObjectEntries } from 'utils/Object/getObjectEntries';

import './index.css';
import styles from './index.module.css';

const AVATAR_SIZE = 120;

/** Browsers name a printed or saved PDF after the page title. */
export const metadata: Metadata = {
    title: `${SENAEV_FULL_NAME} - CV`,
};

export default async function Page (): Promise<JSX.Element> {
    const markdownFilePath = resolve(getNextJsRootDirectory(), './public/cv/cv.md');

    const markdownContent = await getNoteByFilePath({ filePath: markdownFilePath });

    const markdownComponent = await renderNoteByMarkdownContent({ markdownContent });

    return <div
        className={classNames(
            styles.CV__container,
            FONT_MERRIWEATHER_CLASSNAMES,
            'CvPage_container'
        )}
    >
        <div className={styles.CV__printButtonContainer}>
            <PrintButton/>
        </div>
        <header className={styles.CV__header}>
            <Link
                href={'/'}
                className={styles.CV__avatar}
            >
                <Image
                    width={AVATAR_SIZE}
                    height={AVATAR_SIZE}
                    src={'/img/avatar-head.webp'}
                    alt={'Profile Picture'}
                />
            </Link>
            <div>
                <h1>
                    {SENAEV_FULL_NAME}
                </h1>
                <p className={styles.CV__title}>
                    {SENAEV_CURRENT_DUTY_SHORT}
                </p>
                <ul className={styles.CV__contacts}>
                    {
                        SENEAV_CONTACTS.map(({
                            header,
                            title,
                            link,
                        }, i) => <li key={i}>
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
                        </li>)
                    }
                    <li>
                        {`Location: ${SENAEV_LOCATION}`}
                    </li>
                    <li>
                        {`Languages: ${SENAEV_LANGUAGE_LEVELS.map(({ language, level }) => `${language} (${level})`).join(', ')}`}
                    </li>
                </ul>
            </div>
        </header>

        <main className={styles.CV__content}>
            <MarkdownHeader
                depth={2}
                id={'about-me'}
                text={'About Me'}
            />
            {
                SENAEV_ELEVATOR_PITCH.map((info, i) => <p key={i}>
                    {info}
                </p>)
            }
            {markdownComponent}
            <MarkdownHeader
                depth={2}
                id={'education'}
                text={'Education'}
            />
            {
                SENAEV_EDUCATIONS.map(({
                    since,
                    until,
                    school,
                    schoolLink,
                    degree,
                    level,
                }, i) => <div
                    className={styles.CV__educationItem}
                    key={i}
                >
                    <p className={styles.CV__educationItemDegree}>
                        <strong>
                            {degree}
                        </strong>
                        <time>
                            {`${since} – ${until}`}
                        </time>
                    </p>
                    <p>
                        <i>
                            <a
                                href={schoolLink}
                                target={'_blank'}
                                rel={'noreferrer'}
                            >
                                {school}
                            </a>

                            {NON_BREAKING_SPACE}
                            {'–'}
                            {NON_BREAKING_SPACE}

                            {level}
                        </i>
                    </p>
                </div>)
            }
            <MarkdownHeader
                depth={2}
                id={'skills'}
                text={'Skills'}
            />
            {
                getObjectEntries(SENAEV_SKILLS).map(([
                    skillCategory,
                    skillsArray,
                ], i) => <div key={i}>
                    <MarkdownHeader
                        depth={3}
                        id={`skill-category-${skillCategory}`}
                        text={skillCategory}
                    />
                    <ul>
                        {skillsArray.map((skill, skillIndex) => <li key={skillIndex}>
                            {skill}
                        </li>)}
                    </ul>
                </div>)
            }
        </main>
    </div>;
}
