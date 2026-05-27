// One-time script to create the Notion database that backs Dispatch tickets.
// Usage: node scripts/notion-setup.mjs
//   Requires: NOTION_TOKEN, NOTION_PARENT_PAGE_ID in env.
//   If NOTION_DATABASE_ID is already set, exits with "already configured".

import "dotenv/config";
import { Client } from "@notionhq/client";

const token = process.env.NOTION_TOKEN;
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
const existingDbId = process.env.NOTION_DATABASE_ID;

if (!token) {
  console.error("NOTION_TOKEN is not set. Add it to .env and retry.");
  process.exit(1);
}
if (!parentPageId && !existingDbId) {
  console.error(
    "NOTION_PARENT_PAGE_ID is not set. Add it to .env (the ID of the Notion page you want the database to live under) and retry.",
  );
  process.exit(1);
}

const notion = new Client({ auth: token });

if (existingDbId) {
  try {
    const db = await notion.databases.retrieve({ database_id: existingDbId });
    console.log(`Already configured. Database "${db.title?.[0]?.plain_text ?? existingDbId}" is reachable.`);
    process.exit(0);
  } catch (err) {
    console.error(
      "NOTION_DATABASE_ID is set but the database could not be retrieved. Either fix the ID, unset it to create a new one, or share the page with the integration.",
    );
    console.error(err);
    process.exit(1);
  }
}

const STATUS_OPTIONS = [
  { name: "NEW" },
  { name: "REVIEWING" },
  { name: "FIXING" },
  { name: "AWAITING_CONFIRMATION" },
  { name: "CLOSED" },
  { name: "REOPENED" },
];

const CATEGORY_OPTIONS = [
  { name: "BUG" },
  { name: "CONTENT" },
  { name: "FEATURE" },
  { name: "QUESTION" },
  { name: "URGENT" },
  { name: "UPDATE" },
];

// @notionhq/client v5: properties go inside initial_data_source, not at top level.
const db = await notion.databases.create({
  parent: { type: "page_id", page_id: parentPageId },
  title: [{ type: "text", text: { content: "Dispatch tickets (backup)" } }],
  initial_data_source: {
    properties: {
      "Ticket #": { title: {} },
      Status: { select: { options: STATUS_OPTIONS } },
      Category: { select: { options: CATEGORY_OPTIONS } },
      Site: { rich_text: {} },
      Client: { rich_text: {} },
      "Client email": { email: {} },
      Emergency: { checkbox: {} },
      Created: { date: {} },
      "Dispatch link": { url: {} },
    },
  },
});

console.log("\nDatabase created.");
console.log("NOTION_DATABASE_ID=" + db.id);
console.log("\nNext steps:");
console.log("  1. Paste the above NOTION_DATABASE_ID= line into your .env (do NOT read .env — append via shell).");
console.log("  2. Add NOTION_TOKEN and NOTION_DATABASE_ID to Vercel project env vars for all environments.");
