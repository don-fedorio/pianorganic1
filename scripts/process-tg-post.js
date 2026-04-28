#!/usr/bin/env node
"use strict";

const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const postText = process.env.TG_POST_TEXT;
const postTimestamp = parseInt(process.env.TG_POST_DATE || "0", 10);

if (!postText) {
  console.error("TG_POST_TEXT is required");
  process.exit(1);
}

const postDate = postTimestamp
  ? new Date(postTimestamp * 1000).toISOString().split("T")[0]
  : new Date().toISOString().split("T")[0];

const ROOT = path.resolve(__dirname, "..");

async function main() {
  const ruGraph = JSON.parse(fs.readFileSync(path.join(ROOT, "data/graph_ru.json"), "utf8"));
  const enGraph = JSON.parse(fs.readFileSync(path.join(ROOT, "data/graph_en.json"), "utf8"));

  const ruNodeList = ruGraph.nodes.map((n) => `  "${n.id}": ${n.desc}`).join("\n");
  const enNodeList = enGraph.nodes.map((n) => `  "${n.id}": ${n.desc}`).join("\n");

  const prompt = `You are processing a Telegram post for the piano pedagogy website pianorganic.info.

The site is bilingual (Russian default, English at /en/). Your job:
1. Turn the Telegram post into a clean Russian blog article
2. Find which existing graph nodes it connects to semantically
3. Produce an English translation as a separate blog article
4. Find English graph connections

TELEGRAM POST (Russian):
"""
${postText}
"""

EXISTING RUSSIAN GRAPH NODES (id: description):
${ruNodeList}

EXISTING ENGLISH GRAPH NODES (id: description):
${enNodeList}

Return ONLY valid JSON — no markdown fences, no extra text. Schema:
{
  "ru": {
    "slug": "transliterated-slug-2-to-4-words",
    "title": "Заголовок статьи",
    "label": ["Строка 1", "Строка 2"],
    "description": "Одно-два предложения для карточки в графе",
    "content": "Полный текст статьи в Markdown (без заголовка первого уровня)",
    "connections": ["existing-ru-node-id", "another-ru-node-id"]
  },
  "en": {
    "slug": "english-slug-2-to-4-words",
    "title": "Article Title",
    "label": ["Line 1", "Line 2"],
    "description": "One or two sentences for the graph card",
    "content": "Full article text in Markdown (no h1 heading)",
    "connections": ["existing-en-node-id", "another-en-node-id"]
  }
}

Rules:
- slug: lowercase, hyphens only, no Cyrillic
- label: array of 1–2 short strings (graph node label, split naturally across 2 lines if title is long)
- connections: 2–4 IDs that must exist in the respective node list above
- Russian content: no letter ё, keep the author's personal reflective voice
- English content: natural idiomatic English, not a word-for-word translation
- content: Markdown paragraphs, 400–900 words, no top-level # heading`;

  console.log("Calling Claude API...");
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  let result;
  try {
    result = JSON.parse(response.content[0].text.trim());
  } catch (e) {
    console.error("Failed to parse Claude response as JSON:", response.content[0].text);
    throw e;
  }

  // Validate connections reference real nodes
  const ruNodeIds = new Set(ruGraph.nodes.map((n) => n.id));
  const enNodeIds = new Set(enGraph.nodes.map((n) => n.id));

  result.ru.connections = result.ru.connections.filter((id) => {
    if (!ruNodeIds.has(id)) { console.warn(`Skipping unknown RU node: ${id}`); return false; }
    return true;
  });
  result.en.connections = result.en.connections.filter((id) => {
    if (!enNodeIds.has(id)) { console.warn(`Skipping unknown EN node: ${id}`); return false; }
    return true;
  });

  // Create RU blog post
  const ruSlug = result.ru.slug;
  const ruDir = path.join(ROOT, `content/ru/blog/${ruSlug}`);
  fs.mkdirSync(ruDir, { recursive: true });
  fs.writeFileSync(
    path.join(ruDir, `${ruSlug}.md`),
    buildFrontmatter(result.ru.title, postDate) + result.ru.content + "\n"
  );
  console.log(`Created RU: content/ru/blog/${ruSlug}/${ruSlug}.md`);

  // Create EN blog post
  const enSlug = result.en.slug;
  const enDir = path.join(ROOT, `content/en/blog/${enSlug}`);
  fs.mkdirSync(enDir, { recursive: true });
  fs.writeFileSync(
    path.join(enDir, `${enSlug}.md`),
    buildFrontmatter(result.en.title, postDate) + result.en.content + "\n"
  );
  console.log(`Created EN: content/en/blog/${enSlug}/${enSlug}.md`);

  // Update RU graph
  ruGraph.nodes.push({
    id: ruSlug,
    label: result.ru.label,
    url: `/blog/${ruSlug}/${ruSlug}/`,
    desc: result.ru.description,
  });
  result.ru.connections.forEach((target) => {
    ruGraph.links.push({ source: ruSlug, target });
  });
  fs.writeFileSync(
    path.join(ROOT, "data/graph_ru.json"),
    JSON.stringify(ruGraph, null, 2) + "\n"
  );
  console.log(`Updated data/graph_ru.json (+1 node, +${result.ru.connections.length} links)`);

  // Update EN graph
  enGraph.nodes.push({
    id: enSlug,
    label: result.en.label,
    url: `/en/blog/${enSlug}/${enSlug}/`,
    desc: result.en.description,
  });
  result.en.connections.forEach((target) => {
    enGraph.links.push({ source: enSlug, target });
  });
  fs.writeFileSync(
    path.join(ROOT, "data/graph_en.json"),
    JSON.stringify(enGraph, null, 2) + "\n"
  );
  console.log(`Updated data/graph_en.json (+1 node, +${result.en.connections.length} links)`);
}

function buildFrontmatter(title, date) {
  return `---\ntitle: "${title.replace(/"/g, '\\"')}"\ndate: ${date}\ndraft: false\n---\n\n`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
