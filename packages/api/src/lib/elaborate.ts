import Anthropic from '@anthropic-ai/sdk';

// Elaboration AI meta-prompt
const ELABORATION_SYSTEM_PROMPT = `You are a scenario designer for a conversation practice app. Users describe someone they want to practice talking to, and you generate a realistic persona and coaching guidance.

The app helps people practice difficult conversations with two AI characters:
1. A "conversation partner" who plays the role of the person they described
2. A "coach" who provides real-time guidance to the user (the partner can't see coach messages)

SAFETY - Refuse requests that:
- Practice harassment, intimidation, manipulation, or abuse
- Roleplay illegal activities
- Create sexually explicit scenarios
- Target specific real public figures by name

For approved scenarios, generate prompts that create realistic, nuanced characters - not caricatures. The partner should feel like a real person with their own perspective, not just an obstacle.

OUTPUT FORMAT (JSON only, no markdown):
{
  "approved": true,
  "persona": "Brief 3-5 word description (e.g., 'Dismissive manager', 'Defensive ex-partner')",
  "partnerPrompt": "Full system prompt for the conversation partner AI. Include personality traits, communication style, underlying motivations, and how they might respond to different approaches. 150-300 words.",
  "coachPrompt": "Full system prompt for the coach AI. Include what dynamics to watch for, what approaches might work, and how to give actionable real-time guidance. 100-200 words."
}

If refusing:
{
  "approved": false,
  "refusalReason": "Brief explanation of why this can't be created"
}`;

export interface ElaborationResult {
  approved: boolean;
  persona?: string;
  partnerPrompt?: string;
  coachPrompt?: string;
  refusalReason?: string;
}

export interface ElaborationSuccess {
  success: true;
  persona: string;
  partnerPrompt: string;
  coachPrompt: string;
}

export interface ElaborationFailure {
  success: false;
  refusalReason: string;
}

export type ElaborationResponse = ElaborationSuccess | ElaborationFailure;

/**
 * Call the elaboration AI to turn a user's description into system prompts.
 */
export async function elaborateDescription(description: string): Promise<ElaborationResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY environment variable');
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: ELABORATION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Please create a conversation practice scenario based on this description:\n\n"${description}"`,
      },
    ],
  });

  // Extract text content
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from elaboration AI');
  }

  // Parse JSON response
  let result: ElaborationResult;
  try {
    result = JSON.parse(textBlock.text) as ElaborationResult;
  } catch (err) {
    const preview = textBlock.text.slice(0, 500);
    console.error('Failed to parse elaboration AI response as JSON.', {
      error: err,
      responsePreview: preview,
      responseLength: textBlock.text.length,
    });
    throw new Error('Failed to parse elaboration AI response as JSON');
  }

  if (!result.approved) {
    return {
      success: false,
      refusalReason: result.refusalReason ?? 'This scenario cannot be created.',
    };
  }

  if (!result.persona || !result.partnerPrompt || !result.coachPrompt) {
    throw new Error('Elaboration returned incomplete data');
  }

  return {
    success: true,
    persona: result.persona,
    partnerPrompt: result.partnerPrompt,
    coachPrompt: result.coachPrompt,
  };
}
