'use server';

/**
 * @fileOverview Summarizes the sentiments expressed in a list of signatures.
 *
 * - summarizeSignatureSentiments - A function that takes a list of signatures and returns a sentiment summary.
 * - SummarizeSignatureSentimentsInput - The input type for the summarizeSignatureSentiments function.
 * - SummarizeSignatureSentimentsOutput - The return type for the summarizeSignatureSentiments function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeSignatureSentimentsInputSchema = z.object({
  signatures: z
    .array(z.string())
    .describe('An array of signature messages to analyze.'),
});
export type SummarizeSignatureSentimentsInput = z.infer<
  typeof SummarizeSignatureSentimentsInputSchema
>;

const SummarizeSignatureSentimentsOutputSchema = z.object({
  sentimentSummary: z
    .string()
    .describe('A summary of the sentiments expressed in the signatures.'),
});
export type SummarizeSignatureSentimentsOutput = z.infer<
  typeof SummarizeSignatureSentimentsOutputSchema
>;

export async function summarizeSignatureSentiments(
  input: SummarizeSignatureSentimentsInput
): Promise<SummarizeSignatureSentimentsOutput> {
  return summarizeSignatureSentimentsFlow(input);
}

const summarizeSignatureSentimentsPrompt = ai.definePrompt({
  name: 'summarizeSignatureSentimentsPrompt',
  input: {schema: SummarizeSignatureSentimentsInputSchema},
  output: {schema: SummarizeSignatureSentimentsOutputSchema},
  prompt: `Summarize the overall sentiment expressed in the following signatures.  Focus on identifying and articulating overarching emotional trends and key sentiments.
Signatures:
{{#each signatures}}
- {{{this}}}
{{/each}}`,
});

const summarizeSignatureSentimentsFlow = ai.defineFlow(
  {
    name: 'summarizeSignatureSentimentsFlow',
    inputSchema: SummarizeSignatureSentimentsInputSchema,
    outputSchema: SummarizeSignatureSentimentsOutputSchema,
  },
  async input => {
    const {output} = await summarizeSignatureSentimentsPrompt(input);
    return output!;
  }
);
