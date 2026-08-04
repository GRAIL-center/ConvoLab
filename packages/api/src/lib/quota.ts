import type { PrismaClient } from '@workspace/database';

export interface Quota {
  tokens: number;
  label?: string;
}

/**
 * Safely parse a quota from Prisma JSON field.
 * Returns a typed Quota object.
 */
export function parseQuota(json: unknown): Quota {
  if (!json || typeof json !== 'object') {
    return { tokens: 0 };
  }
  const obj = json as Record<string, unknown>;
  return {
    tokens: typeof obj.tokens === 'number' ? obj.tokens : 0,
    label: typeof obj.label === 'string' ? obj.label : undefined,
  };
}

export interface QuotaStatus {
  allowed: boolean;
  remaining: number;
  total: number;
}

function parseUsageTotal(json: unknown): number | null {
  if (!json || typeof json !== 'object') return null;

  const usage = json as Record<string, unknown>;
  if (typeof usage.totalTokens === 'number') return usage.totalTokens;

  const inputTokens = typeof usage.inputTokens === 'number' ? usage.inputTokens : 0;
  const outputTokens = typeof usage.outputTokens === 'number' ? usage.outputTokens : 0;
  const total = inputTokens + outputTokens;

  return total > 0 ? total : null;
}

/**
 * Check if quota allows more usage.
 */
export function checkQuota(quota: Quota, usedTokens: number): QuotaStatus {
  const remaining = quota.tokens - usedTokens;
  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining),
    total: quota.tokens,
  };
}

/**
 * Get total token usage for an invitation from UsageLog.
 */
export async function getUsageForInvitation(
  prisma: PrismaClient,
  invitationId: string
): Promise<number> {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: { usage: true },
  });
  const denormalizedUsage = parseUsageTotal(invitation?.usage);
  if (denormalizedUsage !== null) return denormalizedUsage;

  const result = await prisma.usageLog.aggregate({
    where: { invitationId },
    _sum: {
      inputTokens: true,
      outputTokens: true,
    },
  });

  return (result._sum.inputTokens ?? 0) + (result._sum.outputTokens ?? 0);
}

/**
 * Get quota status for an invitation.
 */
export async function getInvitationQuotaStatus(
  prisma: PrismaClient,
  invitationId: string,
  quota: Quota
): Promise<QuotaStatus> {
  const usedTokens = await getUsageForInvitation(prisma, invitationId);
  return checkQuota(quota, usedTokens);
}
