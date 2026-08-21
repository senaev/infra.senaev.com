export function shuffleArray<T>(array: T[]) {
    let currentIndex = array.length;

    while (currentIndex !== 0) {
        // Pick a remaining element...
        const randomIndex = Math.floor(Math.random() * currentIndex);

        currentIndex--;

        // Both indices are below the original length, so neither read is a hole.
        [
            array[currentIndex],
            array[randomIndex],
        ] = [
            array[randomIndex]!,
            array[currentIndex]!,
        ];
    }
}
