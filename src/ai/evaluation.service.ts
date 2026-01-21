import axios from 'axios';

const OLLAMA_URL = 'http://localhost:11434/api/generate';

export async function evaluateAnswer(
  question: string,
  transcript: string
): Promise<{ score: number; feedback: string }> {
  const prompt = `
You are an interview evaluator.

Question:
"${question}"

Candidate Answer:
"${transcript}"

Evaluate the answer on:
- clarity
- technical correctness
- completeness

Respond with a JSON object containing:
score (0-10)
feedback (string)
`;

  const response = await axios.post(
    OLLAMA_URL,
    {
      model: 'llama3',
      prompt,
      stream: false,
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const rawText: string = response.data.response;

  // ✅ Extract JSON safely
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error(`No JSON found in Ollama response: ${rawText}`);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Failed to parse extracted JSON: ${jsonMatch[0]}`);
  }
}
