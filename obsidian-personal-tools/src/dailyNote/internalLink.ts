import { App } from 'obsidian';

/**
 * Turns `link` into a working Obsidian internal link pointing at
 * `linkpath`, navigating via `Workspace.openLinkText` on click (creating the
 * target note if it doesn't exist yet, same as a normal `[[wikilink]]`).
 */
export function attachInternalLink(app: App, link: HTMLAnchorElement, linkpath: string): void {
	link.dataset.href = linkpath;
	link.setAttribute('href', linkpath);
	link.addEventListener('click', (evt) => {
		evt.preventDefault();
		void app.workspace.openLinkText(linkpath, '', evt.ctrlKey || evt.metaKey);
	});
}
