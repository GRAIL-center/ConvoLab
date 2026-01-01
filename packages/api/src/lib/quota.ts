import type { PrismaClient } from '@workspace/database';

export interface Quota {
  tokens: number;
  label?: string;
}

export interface QuotaStatus {
  allowed: boolean;
  remaining: number;
  total: number;
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
