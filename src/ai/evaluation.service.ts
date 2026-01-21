import { openai } from './openai.client';

export async function evaluateAnswer(
  question: string,
  transcript: string
): Promise<{ score: number; feedback: string }> {
  const prompt = `You are an interview evaluator.

Question: "${question}"

Candidate Answer: "${transcript}"

Evaluate the answer on:
- clarity
- technical correctness
- completeness

Respond with ONLY a valid JSON object (no markdown, no extra text) containing:
{
  "score": <number 0-10>,
  "feedback": "<string>"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  });

  const rawText = response.choices[0]?.message?.content || '';

  // ✅ Extract JSON safely
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error(`No JSON found in OpenAI response: ${rawText}`);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Failed to parse extracted JSON: ${jsonMatch[0]}`);
  }
}
