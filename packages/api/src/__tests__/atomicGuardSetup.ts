// Deliberately lighter than setup.ts. The atomic suite (atomic.test.ts,
// conversation.atomic.test.ts) carries its own self-contained in-memory
// Firestore fakes and never calls createPrismaClient() or getFirestoreClient()
// directly, so it doesn't need setup.ts's FakeFirestore mock or cleanDatabase
// hooks -- wiring the full setup.ts in here was tried and breaks both test
// files (beforeAll's createPrismaClient() hits the real, unmocked Firestore
// client and throws "FIRESTORE_PROJECT_ID is not set", since these tests
// never configure that env var by design).
//
// What the atomic suite DOES need is the same fail-closed check every other
// suite gets: refuse to run against production Firestore without an emulator
// configured. That's the only thing this file does.
import { assertSafeFirestoreTestTarget } from './firestoreProductionGuard.js';

assertSafeFirestoreTestTarget();
