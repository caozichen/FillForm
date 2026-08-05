export function buildFillPayload(fields = [], valueResolver) {
  const payload = {};
  for (const field of fields) {
    payload[field.id] = valueResolver(field);
  }
  return payload;
}
