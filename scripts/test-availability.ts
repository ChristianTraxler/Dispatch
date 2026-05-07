// scripts/test-availability.ts
// Run with: npx tsx scripts/test-availability.ts
import { runChecks } from "../lib/availability.test-helpers";

console.log("computeAvailability:");
const { passed, failed } = runChecks();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
