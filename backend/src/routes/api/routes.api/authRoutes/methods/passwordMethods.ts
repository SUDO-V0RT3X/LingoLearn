import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const keyLength = 64;

export class PasswordMethods {
    /**
     * Hashes a plaintext password with scrypt and a unique salt for storage.
     */
    static async hashPassword(password: string): Promise<string> {
        const salt = randomBytes(16).toString('hex');
        const derivedKey = await scryptAsync(password, salt, keyLength) as Buffer;
        return `scrypt:${salt}:${derivedKey.toString('hex')}`;
    }

    /**
     * Verifies a plaintext password against the stored scrypt hash.
     */
    static async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
        const [algorithm, salt, storedHash] = passwordHash.split(':');
        if (algorithm !== 'scrypt' || !salt || !storedHash) return false;

        const derivedKey = await scryptAsync(password, salt, keyLength) as Buffer;
        const storedKey = Buffer.from(storedHash, 'hex');
        if (storedKey.length !== derivedKey.length) return false;

        return timingSafeEqual(storedKey, derivedKey);
    }
}
