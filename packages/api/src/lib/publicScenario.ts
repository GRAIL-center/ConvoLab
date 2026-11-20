/**
 * Scenarios the public practice app may list and start.
 * "pilot" belongs to the study flow. "draft" is withheld while prompts are
 * rewritten (angry uncle, difficult coworker). Missing audience is treated as
 * public so records created before the field existed still list.
 */
export function isPublicScenario(audience: string | null | undefined): boolean {
  return audience !== 'pilot' && audience !== 'draft';
}
