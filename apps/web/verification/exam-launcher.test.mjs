import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import test from "node:test";
import {
  assertFixtureMarker,
  assertPortAvailable,
  requireDisposableUrl,
} from "../e2e/run-exam-verification.mjs";

test("refuses missing, ordinary or remote database targets", () => {
  for (const value of [undefined, "", "postgresql://u:p@localhost/quiz",
    "postgresql://u:p@example.com/quiz_exam_verify_run1",
    "postgresql://u:p@127.0.0.1/quiz_exam_verify_run1?host=example.com"]) {
    assert.throws(() => requireDisposableUrl(value), /disposable|EXAM_VERIFY/);
  }
  const url = "postgresql://u:p@127.0.0.1:55439/quiz_exam_verify_run1";
  assert.equal(requireDisposableUrl(url), url);
});

for (const host of ["127.0.0.1", "::1"]) test(`refuses an occupied ${host} port`, async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await assert.rejects(assertPortAvailable(address.port), /occupied|in use/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

async function withMarkerServer(body, status, callback) {
  const server = createHttpServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.headers.authorization, "Bearer synthetic-test-token");
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const marker = {
  examId: "d49817af-3431-40a4-840a-e89187bb5c14",
  title: "synthetic-random-marker",
  accessToken: "synthetic-test-token",
};

test("refuses a missing fixture or an unrelated API response", async () => {
  await withMarkerServer({ code: "EXAM_NOT_FOUND" }, 404, async (apiUrl) => {
    await assert.rejects(assertFixtureMarker({ ...marker, apiUrl }), /identity|marker/);
  });
  await withMarkerServer({ data: { id: marker.examId, title: "wrong", state: "DRAFT" } }, 200, async (apiUrl) => {
    await assert.rejects(assertFixtureMarker({ ...marker, apiUrl }), /identity|marker/);
  });
});

test("accepts only the exact private Draft marker with its authenticated read", async () => {
  const body = { data: { id: marker.examId, title: marker.title, state: "DRAFT" } };
  await withMarkerServer(body, 200, async (apiUrl) => {
    await assertFixtureMarker({ ...marker, apiUrl });
  });
});
