interface OpenAIChoiceMessage {
    role: string;
    content: string;
}

interface OpenAIChoice {
    index: string;
    finish_reason: string;
    message?: OpenAIChoiceMessage;
    text?: string;
    logprobs?: any;
}
interface OpenAIUsage {
    completion_tokens: number;
}

interface OpenAIStreamResponse {
    id: string;
    object: string;
    created: string;
    choices: OpenAIChoice[];
    model: string;
    usage: OpenAIUsage;
}

interface CohereGeneration {
    id: string;
    text: string;
    finish_reason: string;
}

interface CohereStreamResponse {
    id: string;
    generations: CohereGeneration[];
    prompt: string;
}

interface ParsedChunk {
    is_finished: boolean;
    finish_reason: string;
    response?: {
        id: string;
        generations: CohereGeneration[];
        prompt: string;
    };
    text?: string;
}


interface AnthropicStreamResponse {
    completion: string;
    stop_reason: string;
    model: string;
    truncated: boolean;
    stop: null | string;
    log_id: string;
    exception: any | null;
}

interface Examples {
    input?: Message;
    output?: Message
}

interface CitationSource {
    startIndex?: number;
    endIndex?: number;
    uri?: string;
    license?: string;
}


interface CitationMetadata {
    citationSources?: CitationSource[]
}


interface PalmMessage {
    content?: string;
    author?: string;
    citationMetadata?: CitationMetadata
}

interface ContentFilter {
    "reason": "BLOCKED_REASON_UNSPECIFIED" | "SAFETY" | "OTHER",
    "message": string
}

export interface PalmChatCompleteResponse {
    candidates: PalmMessage[],
    messages: PalmMessage[],
    filters: ContentFilter[]
}

interface PalmTextOutput {
    output: string,
    safetyRatings: safetyRatings[]
}

interface safetyRatings {
    category: "HARM_CATEGORY_DEROGATORY" | "HARM_CATEGORY_TOXICITY" | "HARM_CATEGORY_VIOLENCE" | "HARM_CATEGORY_SEXUAL" | "HARM_CATEGORY_MEDICAL" | "HARM_CATEGORY_DANGEROUS",
    probability: "NEGLIGIBLE" | "LOW" | "HIGH"
}

interface PalmFilter {
    reason: "OTHER"
}

export interface PalmCompleteResponse {
    candidates: PalmTextOutput[]
    filters: PalmFilter[]
}