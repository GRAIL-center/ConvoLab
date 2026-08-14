/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

/**
 * True if `req` carries the shared secret Qualtrics is configured to send.
 *
 * Fails CLOSED: an unset QUALTRICS_WEBHOOK_SECRET rejects every request
 * rather than accepting everything, so a deploy that forgot to configure the
 * secret is loud (every request 401s) instead of silently wide open — the
 * failure mode this endpoint shipped with until 13 Aug 2026.
 *
 * Accepts the secret as either the `x-webhook-secret` header (Qualtrics
 * Workflows "Web Service" task supports custom headers — prefer this) or a
 * `?secret=` query parameter (fallback for trigger types that only expose a
 * configurable URL). Comparison is constant-time so response latency cannot
 * be used to guess the secret byte by byte.
 *
 * @param {Object} req The incoming request.
 * @return {boolean} True if the request carries the shared secret.
 */
function isAuthorizedQualtricsRequest(req) {
  const expected = process.env.QUALTRICS_WEBHOOK_SECRET;
  if (!expected) return false;

  const provided = req.get("x-webhook-secret") || req.query.secret || "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(String(provided));
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

exports.qualtricsWebhook = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Only POST allowed");
    }

    if (!isAuthorizedQualtricsRequest(req)) {
      // Never log the provided/expected secret. An unset env var and a wrong
      // secret get the same response so a prober cannot distinguish
      // misconfiguration from a locked-down endpoint.
      console.warn("qualtricsWebhook: rejected unauthorized request", {
        hasSecretConfigured: Boolean(process.env.QUALTRICS_WEBHOOK_SECRET),
      });
      return res.status(401).send("Unauthorized");
    }

    const data = req.body;

    // Optional: log raw payload for debugging
    console.log("Qualtrics payload:", data);

    const db = admin.firestore();

    await db.collection("surveyResponses").add({
      raw: data,
      receivedAt: new Date().toISOString(),
      source: "qualtrics",
    });

    return res.status(200).send("Saved to Firestore");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error saving response");
  }
});

// Exported for tests only.
exports._isAuthorizedQualtricsRequest = isAuthorizedQualtricsRequest;

const {setGlobalOptions} = require("firebase-functions");
// const {onRequest} = require("firebase-functions/https");
// const logger = require("firebase-functions/logger");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
