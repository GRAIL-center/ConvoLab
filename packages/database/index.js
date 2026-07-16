import { Firestore } from '@google-cloud/firestore';
// Initialize Firestore client using env var with fallback for tests
// getDb reads FIRESTORE_PROJECT_ID lazily
let dbInstance = null;
function getDb() {
    if (!dbInstance) {
        dbInstance = new Firestore({
            projectId: process.env.FIRESTORE_PROJECT_ID,
        });
    }
    return dbInstance;
}
/** Helper to get collection reference */
function col(name) {
    return getDb().collection(name);
}
/** Generic CRUD operations used by the shim */
async function findUnique(model, args) {
    const doc = await col(model).doc(args.where.id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
}
async function findMany(model, args) {
    const snapshot = await col(model).get();
    const results = [];
    snapshot.forEach(doc => {
        results.push({ id: doc.id, ...doc.data() });
    });
    return results;
}
async function create(model, args) {
    const data = args.data;
    const ref = data.id ? col(model).doc(data.id) : col(model).doc();
    await ref.set(data);
    return { id: ref.id, ...data };
}
async function update(model, args) {
    const ref = col(model).doc(args.where.id);
    await ref.update(args.data);
    const doc = await ref.get();
    return { id: doc.id, ...doc.data() };
}
async function upsert(model, args) {
    const ref = col(model).doc(args.where.id);
    const doc = await ref.get();
    if (doc.exists) {
        await ref.update(args.update);
    }
    else {
        await ref.set(args.create);
    }
    const finalDoc = await ref.get();
    return { id: finalDoc.id, ...finalDoc.data() };
}
async function deleteMany(model, args) {
    const batch = getDb().batch();
    const snapshot = await col(model).get();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
}
/** Minimal aggregate mock – returns empty result (can be extended later) */
async function aggregate(model, args) {
    return { _sum: {}, _count: {} };
}
/** Export a Prisma‑like object with model namespaces */
/* Helper to build a model proxy with common CRUD operations */
function modelProxy(model) {
    return {
        findUnique: (args) => findUnique(model, args),
        findMany: (args) => findMany(model, args),
        create: (args) => create(model, args),
        update: (args) => update(model, args),
        upsert: (args) => upsert(model, args),
        delete: async (args) => {
            await col(model).doc(args.where.id).delete();
        },
        deleteMany: (args) => deleteMany(model, args),
        findFirst: async (args) => {
            const list = await findMany(model, args);
            return list.length > 0 ? list[0] : null;
        },
        count: async (args) => {
            const snapshot = await col(model).get();
            return snapshot.size;
        },
    };
}
/** Export a Prisma‑like object with model namespaces */
export const Role = {
    GUEST: 'GUEST',
    USER: 'USER',
    STAFF: 'STAFF',
    ADMIN: 'ADMIN',
};
export const prisma = {
    // ConversationSession model
    conversationSession: modelProxy('conversationSessions'),
    // Message model
    message: modelProxy('messages'),
    // LappScore model
    lappScore: modelProxy('lappScores'),
    // UsageLog model with extra createMany & aggregate
    usageLog: {
        ...modelProxy('usageLogs'),
        createMany: async (args) => {
            const batch = getDb().batch();
            for (const data of args.data) {
                const ref = col('usageLogs').doc();
                batch.set(ref, data);
            }
            await batch.commit();
        },
        aggregate: (args) => aggregate('usageLogs', args),
    },
    // User model
    user: {
        ...modelProxy('users'),
        delete: async (args) => {
            await col('users').doc(args.where.id).delete();
        },
    },
    // Invitation model
    invitation: modelProxy('invitations'),
    // TelemetryEvent model
    telemetryEvent: modelProxy('telemetryEvents'),
    // Additional generic models used in tests – passthrough
    observationNote: modelProxy('observationNotes'),
    externalIdentity: modelProxy('externalIdentities'),
    contactMethod: modelProxy('contactMethods'),
    scenario: modelProxy('scenarios'),
    quotaPreset: modelProxy('quotaPresets'),
};
// No longer re‑exports from @prisma/client
//# sourceMappingURL=index.js.map