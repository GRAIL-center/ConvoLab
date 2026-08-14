const assert = require("node:assert/strict");
const {afterEach, describe, it} = require("node:test");

// admin.initializeApp() runs at module load with no config -- give it a
// project ID via env so requiring index.js doesn't throw before tests run.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "convolab-test";

const {_isAuthorizedQualtricsRequest: isAuthorized} = require("./index.js");

/**
 * @param {object} opts
 * @param {string} [opts.header] Value to return for the auth header.
 * @param {object} [opts.query] Query params object.
 * @param {string} [opts.secretEnv] QUALTRICS_WEBHOOK_SECRET for this case.
 * @return {object} A minimal stand-in for the Express request.
 */
function fakeReq({header, query, secretEnv} = {}) {
  process.env.QUALTRICS_WEBHOOK_SECRET = secretEnv;
  return {
    get: (name) =>
      (name.toLowerCase() === "x-webhook-secret" ? header : undefined),
    query: query || {},
  };
}

describe("qualtricsWebhook auth", () => {
  const originalSecret = process.env.QUALTRICS_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.QUALTRICS_WEBHOOK_SECRET = originalSecret;
  });

  it("fails closed when the secret env var is unset", () => {
    delete process.env.QUALTRICS_WEBHOOK_SECRET;
    const req = {get: () => undefined, query: {}};
    assert.equal(isAuthorized(req), false);
  });

  it("fails closed on an empty-string secret", () => {
    const req = fakeReq({header: "anything", secretEnv: ""});
    assert.equal(isAuthorized(req), false);
  });

  it("accepts the correct secret via header", () => {
    const req = fakeReq({header: "s3cret-value", secretEnv: "s3cret-value"});
    assert.equal(isAuthorized(req), true);
  });

  it("accepts the correct secret via query param", () => {
    const req = fakeReq({
      query: {secret: "s3cret-value"},
      secretEnv: "s3cret-value",
    });
    assert.equal(isAuthorized(req), true);
  });

  it("rejects a wrong secret", () => {
    const req = fakeReq({header: "wrong", secretEnv: "s3cret-value"});
    assert.equal(isAuthorized(req), false);
  });

  it("rejects a same-prefix secret of different length", () => {
    // Guards the length check that runs before timingSafeEqual, which
    // throws (rather than returning false) on mismatched buffer lengths.
    const req = fakeReq({
      header: "s3cret-value-but-longer",
      secretEnv: "s3cret-value",
    });
    assert.equal(isAuthorized(req), false);
  });

  it("rejects when no secret is provided at all", () => {
    const req = fakeReq({secretEnv: "s3cret-value"});
    assert.equal(isAuthorized(req), false);
  });

  it("prefers the header when both header and query secret are sent", () => {
    const req = fakeReq({
      header: "s3cret-value",
      query: {secret: "wrong"},
      secretEnv: "s3cret-value",
    });
    assert.equal(isAuthorized(req), true);
  });
});
