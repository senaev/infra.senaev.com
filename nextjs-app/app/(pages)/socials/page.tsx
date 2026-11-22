import {
    SENAEV_SOCIALS,
} from 'const/const';
import type { JSX } from 'react';

export default function Page(): JSX.Element {
    return <div style={{ padding: '1em' }}>
        {
            SENAEV_SOCIALS.map(({
                name,
                link,
            }, i) => <div
                key={i}
                style={{
                    margin: '0.5em',
                }}
            >
                {'• '}
                <a
                    href={link}
                    target={'_blank'}
                    rel={'noreferrer'}
                >
                    {name}
                </a>
            </div>)
        }
    </div>;
}
