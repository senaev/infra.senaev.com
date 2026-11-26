import type { Metadata } from 'next';

export const SENAEV_FULL_NAME = 'Andrei Senaev';
export const SENAEV_SITE_TITLE = `${SENAEV_FULL_NAME} - personal website`;

export const SENAEV_EMAIL = 'andrei.senaev@gmail.com';
export const SENAEV_EMAIL_LINK = `mailto:${SENAEV_EMAIL}`;

export const SENAEV_PHONE = '+79826990400';
export const SENAEV_PHONE_LINK = `tel:${SENAEV_PHONE}`;

export const SENAEV_LOCATION = 'Madrid, Spain';

export const SENAEV_TELEGRAM_NICKNAME = 'senaev';
export const SENAEV_TELEGRAM_LINK = `https://t.me/${SENAEV_TELEGRAM_NICKNAME}`;
export const SENAEV_LINKEDIN_LINK = 'https://linkedin.com/in/senaev/';
export const SENAEV_GITHUB_LINK = 'https://github.com/senaev';
export const SENAEV_SITE_DOMAIN = 'senaev.com';
export const SENAEV_SITE_URL = `https://${SENAEV_SITE_DOMAIN}`;
export const ME_PAGE_LINK = '/me';

export const SENAEV_SITE_IMAGE_URL = '/img/avatar-head.webp';

export const SENAEV_ELEVATOR_PITCH = ['I\'m a Senior Full-Stack Engineer with 13 years of building revenue-critical systems in Ad Tech, Digital Media and Observability, now working on Flex Logs at Datadog. Before that I spent ten years at Yandex, where I owned the video advertising player behind all Yandex services, authored the video creative standard still used company-wide, and built the interfaces of a new international advertising network with a team I grew to 20 people. I measure my work in money and reliability.'];

export const SENAEV_CV_LINK = '/cv';

export const SENAEV_CURRENT_DUTY = 'Senior Full-Stack Engineer at Datadog';
export const SENAEV_CURRENT_DUTY_SHORT = 'Senior Full-Stack Engineer';

type Contact = {
    header: string;
    title: string;
    link?: string;
};

export const SENAEV_SOCIALS: {
    name: string;
    link: string;
}[] = [
    {
        name: '@senaev_speaks (telegram)',
        link: 'https://t.me/senaev_speaks',
    },
    {
        name: '@senaev_speaks (web)',
        link: '/notes/all_senaev_speaks_posts',
    },
    {
        name: 'LinkedIn',
        link: SENAEV_LINKEDIN_LINK,
    },
    {
        name: 'Habr',
        link: 'https://habr.com/ru/users/senaev/articles/',
    },
    {
        name: 'GitHub',
        link: SENAEV_GITHUB_LINK,
    },
    {
        name: 'X (Twitter)',
        link: 'https://x.com/senaev',
    },
    {
        name: '@senaev_career (teletype)',
        link: 'https://teletype.in/@senaev_career',
    },
    {
        name: '@senaev_tech (teletype)',
        link: 'https://teletype.in/@senaev_tech',
    },
];

export const SENEAV_CONTACTS: Contact[] = [
    {
        header: 'Website',
        title: SENAEV_SITE_DOMAIN,
        link: SENAEV_SITE_URL,
    },
    {
        header: 'LinkedIn',
        title: 'linkedin.com/in/senaev',
        link: SENAEV_LINKEDIN_LINK,
    },
    {
        header: 'GitHub',
        title: 'github.com/senaev',
        link: SENAEV_GITHUB_LINK,
    },
    {
        header: 'Email',
        title: SENAEV_EMAIL,
        link: SENAEV_EMAIL_LINK,
    },
    {
        header: 'Phone',
        title: SENAEV_PHONE,
        link: SENAEV_PHONE_LINK,
    },
    {
        header: 'Telegram',
        title: `@${SENAEV_TELEGRAM_NICKNAME}`,
        link: SENAEV_TELEGRAM_LINK,
    },
];

type Education = {
    since: number;
    until: number;
    school: string;
    schoolLink: string;
    degree: string;
    level: string;
};

export const SENAEV_EDUCATIONS: Education[] = [
    {
        since: 2012,
        until: 2016,
        school: 'Ural Federal University',
        schoolLink: 'https://urfu.ru/en/',
        degree: 'Management in Technical Systems',
        level: 'Bachelor’s Degree',
    },
    {
        since: 2005,
        until: 2009,
        school: 'Ural Radio Engineering College',
        schoolLink: 'https://urtt.ru/',
        degree: 'Computer Equipment & Networks',
        level: 'High School Diploma',
    },
];

export const SENAEV_LANGUAGE_LEVELS: {
    language: string;
    level: string;
}[] = [
    {
        language: 'English',
        level: 'Full Professional',
    },
    {
        language: 'Russian',
        level: 'Native',
    },
];

export const SENAEV_SKILLS: Record<string, string[]> = {
    Languages: [
        'Java / Kotlin / Go (Golang)',
        'TypeScript / JavaScript / Node.js / React.js',
    ],
    Systems: [
        'Distributed Storage and Query Systems at Scale',
        'Distributed Systems / Microservices',
        'Observability (Logs, Metrics, Tracing)',
        'Performance Optimization and Telemetry',
        'A/B Testing, Availability, Incident Response',
    ],
    Infrastructure: [
        'Kubernetes / Docker / Terraform',
        'ClickHouse / YTsaurus',
    ],
};

export const SENAEV_SITE_METADATA: Metadata = {
    title: SENAEV_SITE_TITLE,
    description: SENAEV_SITE_TITLE,
    metadataBase: new URL(SENAEV_SITE_URL),
    icons: {
        icon: '/favicon.ico',
    },
    openGraph: {
        title: SENAEV_SITE_TITLE,
        url: SENAEV_SITE_URL,
        images: [
            {
                url: SENAEV_SITE_IMAGE_URL,
                width: 800,
                height: 600,
            },
        ],
        description: SENAEV_SITE_TITLE,
    },
    robots: {
        index: true,
    },
    other: {
        'yandex-verification': '05e701a03b47b330',
    },
};
