import { PositiveInteger } from '../../types/Number/PositiveInteger';

export function getPrimeNumbersWithEratosthenesSieve(max: PositiveInteger): PositiveInteger[] {
    const sieve = Array.from({ length: max + 1 });

    for (let base = 2; base <= max ** 0.5; base++) {
        for (let i = base ** 2; i <= max; i += base) {
            sieve[i] = true;
        }
    }

    const primes = [];

    for (let i = 2; i <= max; i++) {
        if (!sieve[i]) {
            primes.push(i);
        }
    }

    return primes;
}
