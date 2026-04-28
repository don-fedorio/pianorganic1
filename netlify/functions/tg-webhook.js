"use strict";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let update;
  try {
    update = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Bad Request" };
  }

  // Only handle new channel posts with enough text
  const post = update.channel_post;
  if (!post || !post.text || post.text.length < 150) {
    return { statusCode: 200, body: "OK" };
  }

  const { GITHUB_PAT, GITHUB_REPO } = process.env;
  if (!GITHUB_PAT || !GITHUB_REPO) {
    console.error("Missing GITHUB_PAT or GITHUB_REPO env vars");
    return { statusCode: 500, body: "Server misconfigured" };
  }

  const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `token ${GITHUB_PAT}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "pianorganic-webhook",
    },
    body: JSON.stringify({
      event_type: "new-tg-post",
      client_payload: {
        text: post.text,
        message_id: String(post.message_id),
        date: String(post.date),
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.error("GitHub dispatch failed:", resp.status, body);
    return { statusCode: 500, body: "Dispatch failed" };
  }

  return { statusCode: 200, body: "OK" };
};
