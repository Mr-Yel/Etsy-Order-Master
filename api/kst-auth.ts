import JSEncrypt from "jsencrypt";
import { KST_BASE_URL } from "./constants";

/** 获取公钥接口响应 */
type GetPublicKeyRes = { publicKey?: string };

/** 登录请求体 */
type LoginBody = {
  username: string;
  password: string;
  code?: string;
  uuid?: string;
};

/** 登录成功响应（仅关心 token） */
type LoginRes = { token?: string; [key: string]: unknown };

/**
 * 将上游返回的 base64 公钥转为 PEM（JSEncrypt 需要）
 */
function base64PublicKeyToPem(base64Key: string): string {
  const trimmed = base64Key.replace(/\s/g, "");
  const lines = trimmed.match(/.{1,64}/g) ?? [trimmed];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

/**
 * 使用 RSA 公钥加密明文（与上游约定：PKCS1，结果 base64）
 */
function rsaEncrypt(plainText: string, base64PublicKey: string): string {
  const pem = base64PublicKeyToPem(base64PublicKey);
  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(pem);
  const encrypted = encrypt.encrypt(plainText);
  if (encrypted === false) throw new Error("RSA 加密失败");
  return encrypted;
}

/**
 * 获取上游公钥
 */
export async function getPublicKey(): Promise<string> {
  const res = await fetch(`${KST_BASE_URL}/getPublicKey`);
  const data = (await res.json()) as GetPublicKeyRes;
  const publicKey = data?.publicKey;
  if (!publicKey) throw new Error("获取公钥失败：publicKey 为空");
  return publicKey;
}

/**
 * 登录并返回 token
 * @param username 用户名
 * @param password 明文密码（会先加密再提交）
 * @param code 验证码（可选）
 * @param uuid 验证码 uuid（可选）
 */
export async function login(
  username: string,
  password: string,
  code = "",
  uuid = ""
): Promise<string> {
  const publicKey = await getPublicKey();
  const encryptedPassword = rsaEncrypt(password, publicKey);

  const res = await fetch(`${KST_BASE_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      isToken: "false",
      repeatSubmit: "false",
    },
    body: JSON.stringify({
      username,
      password: encryptedPassword,
      code: code || undefined,
      uuid: uuid || undefined,
    } as LoginBody),
  });

  const data = (await res.json()) as LoginRes;
  const token = data?.token;
  if (!token) {
    const msg = (data as { msg?: string })?.msg ?? JSON.stringify(data);
    throw new Error(`登录失败：${msg}`);
  }
  return token;
}

/** getInfo 接口返回的 user 结构（仅用到的字段） */
export type GetInfoUser = {
  nickName?: string;
  userName?: string;
  dept?: { deptName?: string };
};

/** getInfo 接口响应 */
type GetInfoRes = {
  code?: number;
  msg?: string;
  user?: GetInfoUser;
};

/**
 * 获取当前用户详细信息（需携带 token）
 * 接口文档：https://kstgl.kesiteng.cn/prod-api/getInfo
 */
export async function getInfo(token: string): Promise<GetInfoUser> {
  const res = await fetch(`${KST_BASE_URL}/getInfo`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = (await res.json()) as GetInfoRes;
  if (data?.code !== 200 || !data?.user) {
    const msg = data?.msg ?? "获取用户信息失败";
    throw new Error(msg);
  }
  return data.user;
}
