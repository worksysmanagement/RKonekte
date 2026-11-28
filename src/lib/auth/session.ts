import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ORGANIZATION_ADMIN" | "EMPLOYEE" | string;
  organizationId: string | null;
  organizationName?: string;
  organizationSlug?: string;
  branchId?: string | null;
  branchName?: string;
  employeeNumber?: string;
}

const COOKIE_NAME = "lm_session";
const STOPPED_COOKIE_NAME = "rk_stopped_notice";
const DEFAULT_SECRET = "dev-secret-key-change-in-production-min-32-chars-long";
const SESSION_DURATION = 24 * 60 * 60; // 24 hours in seconds
const STOPPED_NOTICE_DURATION = 30 * 60; // 30 minutes in seconds

export interface StoppedNoticePayload {
  purpose: "SERVICE_STOPPED_NOTICE";
  organizationId: string;
  organizationName: string;
  userId: string;
  userName: string;
  userEmail: string;
  isAdmin: boolean;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CRITICAL SECURITY ERROR: SESSION_SECRET environment variable is missing in production!"
      );
    }
    return new TextEncoder().encode(DEFAULT_SECRET);
  }
  if (process.env.NODE_ENV === "production" && secret === DEFAULT_SECRET) {
    throw new Error(
      "CRITICAL SECURITY ERROR: Default development SESSION_SECRET cannot be used in production!"
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const secret = getSecretKey();
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionUser;
  } catch (err) {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifySessionToken(token);
  } catch (err) {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser): Promise<string> {
  const token = await createSessionToken(user);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });
  return token;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function createStoppedNoticeToken(payload: StoppedNoticePayload): Promise<string> {
  const secret = getSecretKey();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STOPPED_NOTICE_DURATION}s`)
    .sign(secret);
}

export async function verifyStoppedNoticeToken(
  token: string
): Promise<StoppedNoticePayload | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret);
    if ((payload as any)?.purpose !== "SERVICE_STOPPED_NOTICE") {
      return null;
    }
    return payload as unknown as StoppedNoticePayload;
  } catch (_) {
    return null;
  }
}

export async function setStoppedNoticeCookie(
  payload: StoppedNoticePayload
): Promise<string> {
  const token = await createStoppedNoticeToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(STOPPED_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STOPPED_NOTICE_DURATION,
  });
  return token;
}

export async function getStoppedNoticeFromCookies(): Promise<StoppedNoticePayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(STOPPED_COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifyStoppedNoticeToken(token);
  } catch (_) {
    return null;
  }
}

export async function clearStoppedNoticeCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(STOPPED_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
