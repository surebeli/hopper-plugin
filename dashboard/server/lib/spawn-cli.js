export function buildProbeArgs(vendor) {
  return vendor ? ['--probe', vendor] : ['--probe'];
}
