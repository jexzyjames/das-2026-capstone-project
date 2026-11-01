export async function charge({ decline = false } = {}) {
  return { success: decline !== true };
}
