/** Export a Prisma‑like object with model namespaces */
export declare const Role: {
    readonly GUEST: "GUEST";
    readonly USER: "USER";
    readonly STAFF: "STAFF";
    readonly ADMIN: "ADMIN";
};
export type Role = keyof typeof Role;
export declare const prisma: {
    conversationSession: {
        readonly findUnique: (args: any) => Promise<any>;
        readonly findMany: (args?: any) => Promise<any[]>;
        readonly create: (args: any) => Promise<any>;
        readonly update: (args: any) => Promise<any>;
        readonly upsert: (args: any) => Promise<any>;
        readonly delete: (args: any) => Promise<void>;
        readonly deleteMany: (args?: any) => Promise<void>;
        readonly findFirst: (args?: any) => Promise<any>;
        readonly count: (args?: any) => Promise<number>;
    };
    message: {
        readonly findUnique: (args: any) => Promise<any>;
        readonly findMany: (args?: any) => Promise<any[]>;
        readonly create: (args: any) => Promise<any>;
        readonly update: (args: any) => Promise<any>;
        readonly upsert: (args: any) => Promise<any>;
        readonly delete: (args: any) => Promise<void>;
        readonly deleteMany: (args?: any) => Promise<void>;
        readonly findFirst: (args?: any) => Promise<any>;
        readonly count: (args?: any) => Promise<number>;
    };
    lappScore: {
        readonly findUnique: (args: any) => Promise<any>;
        readonly findMany: (args?: any) => Promise<any[]>;
        readonly create: (args: any) => Promise<any>;
        readonly update: (args: any) => Promise<any>;
        readonly upsert: (args: any) => Promise<any>;
        readonly delete: (args: any) => Promise<void>;
        readonly deleteMany: (args?: any) => Promise<void>;
        readonly findFirst: (args?: any) => Promise<any>;
        readonly count: (args?: any) => Promise<number>;
    };
    usageLog: {
        createMany: (args: any) => Promise<void>;
        aggregate: (args: any) => Promise<any>;
        findUnique: (args: any) => Promise<any>;
        findMany: (args?: any) => Promise<any[]>;
        create: (args: any) => Promise<any>;
        update: (args: any) => Promise<any>;
        upsert: (args: any) => Promise<any>;
        delete: (args: any) => Promise<void>;
        deleteMany: (args?: any) => Promise<void>;
        findFirst: (args?: any) => Promise<any>;
        count: (args?: any) => Promise<number>;
    };
    user: {
        delete: (args: any) => Promise<void>;
        findUnique: (args: any) => Promise<any>;
        findMany: (args?: any) => Promise<any[]>;
        create: (args: any) => Promise<any>;
        update: (args: any) => Promise<any>;
        upsert: (args: any) => Promise<any>;
        deleteMany: (args?: any) => Promise<void>;
        findFirst: (args?: any) => Promise<any>;
        count: (args?: any) => Promise<number>;
    };
    invitation: {
        readonly findUnique: (args: any) => Promise<any>;
        readonly findMany: (args?: any) => Promise<any[]>;
        readonly create: (args: any) => Promise<any>;
        readonly update: (args: any) => Promise<any>;
        readonly upsert: (args: any) => Promise<any>;
        readonly delete: (args: any) => Promise<void>;
        readonly deleteMany: (args?: any) => Promise<void>;
        readonly findFirst: (args?: any) => Promise<any>;
        readonly count: (args?: any) => Promise<number>;
    };
    telemetryEvent: {
        readonly findUnique: (args: any) => Promise<any>;
        readonly findMany: (args?: any) => Promise<any[]>;
        readonly create: (args: any) => Promise<any>;
        readonly update: (args: any) => Promise<any>;
        readonly upsert: (args: any) => Promise<any>;
        readonly delete: (args: any) => Promise<void>;
        readonly deleteMany: (args?: any) => Promise<void>;
        readonly findFirst: (args?: any) => Promise<any>;
        readonly count: (args?: any) => Promise<number>;
    };
    observationNote: {
        readonly findUnique: (args: any) => Promise<any>;
        readonly findMany: (args?: any) => Promise<any[]>;
        readonly create: (args: any) => Promise<any>;
        readonly update: (args: any) => Promise<any>;
        readonly upsert: (args: any) => Promise<any>;
        readonly delete: (args: any) => Promise<void>;
        readonly deleteMany: (args?: any) => Promise<void>;
        readonly findFirst: (args?: any) => Promise<any>;
        readonly count: (args?: any) => Promise<number>;
    };
    externalIdentity: {
        readonly findUnique: (args: any) => Promise<any>;
        readonly findMany: (args?: any) => Promise<any[]>;
        readonly create: (args: any) => Promise<any>;
        readonly update: (args: any) => Promise<any>;
        readonly upsert: (args: any) => Promise<any>;
        readonly delete: (args: any) => Promise<void>;
        readonly deleteMany: (args?: any) => Promise<void>;
        readonly findFirst: (args?: any) => Promise<any>;
        readonly count: (args?: any) => Promise<number>;
    };
    contactMethod: {
        readonly findUnique: (args: any) => Promise<any>;
        readonly findMany: (args?: any) => Promise<any[]>;
        readonly create: (args: any) => Promise<any>;
        readonly update: (args: any) => Promise<any>;
        readonly upsert: (args: any) => Promise<any>;
        readonly delete: (args: any) => Promise<void>;
        readonly deleteMany: (args?: any) => Promise<void>;
        readonly findFirst: (args?: any) => Promise<any>;
        readonly count: (args?: any) => Promise<number>;
    };
    scenario: {
        readonly findUnique: (args: any) => Promise<any>;
        readonly findMany: (args?: any) => Promise<any[]>;
        readonly create: (args: any) => Promise<any>;
        readonly update: (args: any) => Promise<any>;
        readonly upsert: (args: any) => Promise<any>;
        readonly delete: (args: any) => Promise<void>;
        readonly deleteMany: (args?: any) => Promise<void>;
        readonly findFirst: (args?: any) => Promise<any>;
        readonly count: (args?: any) => Promise<number>;
    };
    quotaPreset: {
        readonly findUnique: (args: any) => Promise<any>;
        readonly findMany: (args?: any) => Promise<any[]>;
        readonly create: (args: any) => Promise<any>;
        readonly update: (args: any) => Promise<any>;
        readonly upsert: (args: any) => Promise<any>;
        readonly delete: (args: any) => Promise<void>;
        readonly deleteMany: (args?: any) => Promise<void>;
        readonly findFirst: (args?: any) => Promise<any>;
        readonly count: (args?: any) => Promise<number>;
    };
};
export type PrismaClient = typeof prisma;
//# sourceMappingURL=index.d.ts.map