/** Generate a strong random password. */
export function generatePassword(
  length = 20,
  opts: { symbols?: boolean; numbers?: boolean; upper?: boolean; lower?: boolean } = {}
): string {
  const { symbols = true, numbers = true, upper = true, lower = true } = opts;
  let charset = "";
  if (lower) charset += "abcdefghijkmnopqrstuvwxyz";
  if (upper) charset += "ABCDEFGHJKLMNPQRSTUVWXYZ";
  if (numbers) charset += "23456789";
  if (symbols) charset += "!@#$%^&*()-_=+[]{}";
  if (!charset) charset = "abcdefghijklmnopqrstuvwxyz";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) out += charset[arr[i] % charset.length];
  return out;
}

/** Rough password strength score 0-4. */
export function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] };
}
