// Run with: npx tsx scripts/test-vacation-helpers.ts
import { runChecks } from "../lib/vacation-helpers.test-helpers";

console.log("vacation-helpers:");
const { passed, failed } = runChecks();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
