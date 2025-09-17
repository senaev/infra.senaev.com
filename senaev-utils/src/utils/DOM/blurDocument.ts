export function blurDocument(): void {
    (document.activeElement as HTMLElement)?.blur();
}
