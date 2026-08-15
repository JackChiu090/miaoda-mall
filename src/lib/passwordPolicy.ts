/**
 * 平台密码策略：除管理员外，其他所有用户（public.users）
 * 密码只能设置为 123456。
 */

export const DEFAULT_USER_PASSWORD = '123456';

/**
 * 校验普通用户密码是否符合策略
 * @param password 待校验密码
 * @returns 错误信息，合法时返回 null
 */
export function validateUserPassword(password: string): string | null {
  if (!password || password.length < 6) {
    return '密码至少 6 位';
  }
  if (password !== DEFAULT_USER_PASSWORD) {
    return `非管理员用户密码只能设置为 ${DEFAULT_USER_PASSWORD}`;
  }
  return null;
}
