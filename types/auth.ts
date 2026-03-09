/**
 * 本地存储的用户信息（与 storage key eomUser 对应）
 * 由登录管理者统一读写，业务侧仅通过管理者获取
 */
export type StoredUser = {
  token?: string;
  name?: string;
  deptName?: string;
  id?: string;
  email?: string;
};
