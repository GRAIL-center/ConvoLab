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
  "name": "Short catchy title, 2-4 words, title case (e.g., 'Dismissive Manager', 'Defensive Ex', 'Overbearing Parent')",
  "persona": "Longer description for 'Talking with:' context, 5-15 words (e.g., 'Your manager who dismisses ideas without consideration', 'Your ex who gets defensive about past decisions')",
  "partnerPrompt": "Full system prompt for the conversation partner AI. Include personality traits, communication style, underlying motivations, and how they might respond to different approaches. CRITICAL: Instruct the partner to keep responses SHORT - 1-3 sentences max, like real texting or casual conversation. No long paragraphs or monologues. 150-300 words.",
  "coachPrompt": "Full system prompt for the coach AI. Include what dynamics to watch for, what approaches might work, and how to give actionable real-time guidance. 100-200 words."
}

If refusing:
{
  "approved": false,
  "refusalReason": "Brief explanation of why this can't be created"
}`;

export interface ElaborationResult {
  approved: boolean;
  name?: string;
  persona?: string;
  partnerPrompt?: string;
  coachPrompt?: string;
  refusalReason?: string;
}

export interface ElaborationSuccess {
  success: true;
  name: string;
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

  // Parse JSON response (strip markdown code fences if present)
  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith('```')) {
    // Remove opening fence (```json or ```)
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '');
    // Remove closing fence
    jsonText = jsonText.replace(/\n?```\s*$/, '');
  }

  let result: ElaborationResult;
  try {
    result = JSON.parse(jsonText) as ElaborationResult;
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

  if (!result.name || !result.persona || !result.partnerPrompt || !result.coachPrompt) {
    throw new Error('Elaboration returned incomplete data');
  }

  return {
    success: true,
    name: result.name,
    persona: result.persona,
    partnerPrompt: result.partnerPrompt,
    coachPrompt: result.coachPrompt,
  };
}
