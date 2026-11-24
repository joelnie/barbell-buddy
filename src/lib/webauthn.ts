import type { Lifter } from '../types/models';

const FACE_ID_CRED_KEY = 'bb_joel_faceid_cred_v1';

interface StoredFaceIdCredential {
  credentialIdBase64Url: string;
  lifterId: string;
  enrolledAt: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomChallenge(length = 32): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

export async function isPlatformFaceIdAvailable(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    typeof window.PublicKeyCredential === 'undefined' ||
    typeof navigator === 'undefined' ||
    !navigator.credentials
  ) {
    return false;
  }
  try {
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return false;
  } catch {
    return false;
  }
}

export function getEnrolledFaceIdCredential(adminLifterId?: string): StoredFaceIdCredential | null {
  try {
    const raw = localStorage.getItem(FACE_ID_CRED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFaceIdCredential;
    if (!parsed?.credentialIdBase64Url || !parsed?.lifterId) return null;
    if (adminLifterId && parsed.lifterId !== adminLifterId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasEnrolledFaceId(adminLifterId?: string): boolean {
  return getEnrolledFaceIdCredential(adminLifterId) !== null;
}

export function clearEnrolledFaceId(): void {
  localStorage.removeItem(FACE_ID_CRED_KEY);
}

/**
 * Enrolls iPhone Face ID / platform biometric authenticator for Joel.
 * Caller MUST ensure the current active user is already verified as Joel (isAdmin === true).
 */
export async function enrollFaceIdForAdmin(adminLifter: Lifter): Promise<void> {
  if (!adminLifter.isAdmin) {
    throw new Error('Only the admin user (Joel) can enroll Face ID.');
  }
  if (typeof navigator === 'undefined' || !navigator.credentials?.create) {
    throw new Error('Face ID / WebAuthn is not supported in this browser.');
  }

  const userIdBuffer = new ArrayBuffer(adminLifter.id.length);
  const userIdBytes = new Uint8Array(userIdBuffer);
  for (let i = 0; i < adminLifter.id.length; i++) {
    userIdBytes[i] = adminLifter.id.charCodeAt(i) & 0xff;
  }

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(32),
      rp: {
        name: 'Barbell Buddy',
      },
      user: {
        id: userIdBytes,
        name: `${adminLifter.name.toLowerCase()}@barbell-buddy.local`,
        displayName: `${adminLifter.name} (Admin)`,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256 (Apple Secure Enclave / Face ID native)
        { alg: -257, type: 'public-key' }, // RS256 fallback
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!credential?.rawId) {
    throw new Error('Face ID enrollment was cancelled.');
  }

  const stored: StoredFaceIdCredential = {
    credentialIdBase64Url: bytesToBase64Url(new Uint8Array(credential.rawId)),
    lifterId: adminLifter.id,
    enrolledAt: new Date().toISOString(),
  };

  localStorage.setItem(FACE_ID_CRED_KEY, JSON.stringify(stored));
}

export async function verifyFaceIdForAdmin(adminLifterId?: string): Promise<boolean> {
  const enrolled = getEnrolledFaceIdCredential(adminLifterId);
  if (!enrolled) {
    throw new Error('Face ID is not enrolled on this device yet.');
  }
  if (typeof navigator === 'undefined' || !navigator.credentials?.get) {
    throw new Error('Face ID / WebAuthn is not available.');
  }

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(32),
      allowCredentials: [
        {
          id: base64UrlToBytes(enrolled.credentialIdBase64Url),
          type: 'public-key',
          transports: ['internal'],
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  return Boolean(assertion?.id);
}
