import Hashids from 'hashids';

export const ENABLE_HASHIDS = true;
export const HASHIDS_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function normalizeMinLength(value) {
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new Error('项目最小长度必须是正整数');
  }
  return length;
}

export function transformHashids({ operation, value, salt, minLength } = {}) {
  if (!ENABLE_HASHIDS) throw new Error('Hashids 功能未启用');

  const mode = String(operation || '').trim().toLowerCase();
  if (mode !== 'encrypt' && mode !== 'decrypt') {
    throw new Error('不支持的加解密方式');
  }

  const input = requireText(value, mode === 'encrypt' ? '待加密内容' : '待解密内容');
  const projectSalt = requireText(salt, '项目盐值');
  const hashids = new Hashids(projectSalt, normalizeMinLength(minLength), HASHIDS_ALPHABET);

  if (mode === 'encrypt') {
    if (!/^\d+$/.test(input)) {
      throw new Error('Hashids 加密内容必须是非负整数');
    }
    const result = hashids.encodeHex(input);
    if (!result) throw new Error('未生成有效结果，请检查输入和项目配置');
    return result;
  }

  if ([...input].some((char) => !HASHIDS_ALPHABET.includes(char))) {
    throw new Error('密文包含不支持的字符');
  }
  const decoded = hashids.decodeHex(input);
  if (!decoded) {
    throw new Error('密文与当前项目配置不匹配');
  }
  return decoded;
}
